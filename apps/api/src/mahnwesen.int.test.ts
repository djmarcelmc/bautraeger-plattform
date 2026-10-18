/** Integrationstests Mahnwesen (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Mahnwesen (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "buchhaltung@example.com");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());
    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH", anschrift: "Hauptstraße 1, 70173 Stuttgart" })).body.id;
    const p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    const e = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "100000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", anrede: "Frau", vorname: "Erika", nachname: "Muster", rollen: ["kunde"] })).body.id;
    ids.v = (
      await als(http.post("/api/kaufvertraege")).send({
        projektId: p,
        zahlungsanforderungAn: k,
        kaeufer: [{ partnerId: k }],
        einheiten: [{ einheitId: e, vkBrutto: "100000" }],
        vertragWirksam: true,
        vormerkungEingetragenAm: "2026-04-01",
        lastenfreistellungGesichert: true,
      })
    ).body.id;
    await als(http.post(`/api/projekte/${p}/bautenstand`)).send({ einheitIds: [e], abschnitt: "erdarbeiten", fertigAm: "2026-05-20" });
    // Rate 1: 30.000 €, angefordert 21.05., fällig 31.05.2026
    ids.za = (await als(http.post(`/api/projekte/${p}/zahlungsanforderungen`)).send({ datum: "2026-05-21" })).body.anforderungen[0].id;
  });

  afterAll(async () => app?.close());

  it("liefert vorbelegte Basiszinssätze und nimmt neue an", async () => {
    const saetze = (await http.get("/api/basiszinssaetze")).body;
    expect(saetze[0]).toMatchObject({ gueltigAb: "2026-07-01", satz: "1.52" });
    expect((await als(http.post("/api/basiszinssaetze")).send({ gueltigAb: "2027-01-15", satz: "2" })).status).toBe(400);
  });

  it("schlägt nach Fälligkeit + Karenz die Zahlungserinnerung vor und rechnet Verzugszinsen", async () => {
    expect((await http.get("/api/mahnwesen/vorschlag?stichtag=2026-06-03")).body[0].vorschlag.stufe).toBeNull();
    const v = (await http.get("/api/mahnwesen/vorschlag?stichtag=2026-07-31")).body;
    expect(v).toHaveLength(1);
    // Verzug ab 01.06.: 30.000 € × (30 T × 6,27 % + 31 T × 6,52 %) / 365 = 154,60 + 166,13
    expect(v[0]).toMatchObject({ rechnungsnr: "ZA-2026-00001", offen: "30000.00", mahnstufe: 0, vorschlag: { stufe: 1 }, verzugszinsen: "320.73", tageUeberfaellig: 61 });
  });

  it("führt einen Mahnlauf über drei Stufen und überspringt laufende Fristen", async () => {
    const lauf1 = (await als(http.post("/api/mahnungen")).send({ zahlungsanforderungIds: [ids.za], datum: "2026-06-10" })).body;
    expect(lauf1.erstellt).toHaveLength(1);
    const zuFrueh = (await als(http.post("/api/mahnungen")).send({ zahlungsanforderungIds: [ids.za], datum: "2026-06-15" })).body;
    expect(zuFrueh).toMatchObject({ erstellt: [], uebersprungen: [{ rechnungsnr: "ZA-2026-00001", grund: "Mahnfrist läuft noch" }] });
    // Teilzahlung vor der 2. Mahnung
    await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: ids.za, datum: "2026-06-16", betrag: "10000" });
    const lauf2 = (await als(http.post("/api/mahnungen")).send({ zahlungsanforderungIds: [ids.za], datum: "2026-06-20", mahngebuehr: "5,00" })).body;
    expect(lauf2.erstellt).toHaveLength(1);
    const [m2] = (await http.get(`/api/mahnungen?ids=${lauf2.erstellt[0]}`)).body;
    expect(m2).toMatchObject({ stufe: 2, titel: "Mahnung", offenerBetrag: "20000.00", mahngebuehr: "5.00", fristBis: "2026-06-27" });
    // 1.–15.6.: 30.000 × 6,27 % × 15/365 = 77,30; 16.–20.6.: 20.000 × 6,27 % × 5/365 = 17,18
    expect(m2.verzugszinsen).toBe("94.48");
    expect(m2.zinsperioden.map((p: { kapital: string; tage: number }) => [p.kapital, p.tage])).toEqual([["30000.00", 15], ["20000.00", 5]]);
    expect(m2.vorherige.map((x: { stufe: number }) => x.stufe)).toEqual([1]);
    expect(m2.empfaenger.nachname).toBe("Muster");
    await als(http.post("/api/mahnungen")).send({ zahlungsanforderungIds: [ids.za], datum: "2026-07-01" });
    const nachStufe3 = (await http.get("/api/mahnwesen/vorschlag?stichtag=2026-07-20")).body[0];
    expect(nachStufe3.vorschlag.hinweis).toMatch(/rechtliche Schritte/);
    const vertrag = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(vertrag.anforderungen[0].mahnungen.map((x: { stufe: number }) => x.stufe)).toEqual([1, 2, 3]);
  });

  it("beachtet die Mahnsperre", async () => {
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    await als(http.put(`/api/kaufvertraege/${ids.v}/konditionen`)).send({ zahlungsanforderungAn: v.zahlungsanforderungAn, vertragWirksam: true, vormerkungEingetragenAm: "2026-04-01", lastenfreistellungGesichert: true, mahnsperre: true });
    const vor = (await http.get("/api/mahnwesen/vorschlag?stichtag=2026-08-01")).body[0];
    expect(vor.vorschlag).toEqual({ stufe: null, hinweis: "Mahnsperre im Kaufvertrag" });
  });
});
