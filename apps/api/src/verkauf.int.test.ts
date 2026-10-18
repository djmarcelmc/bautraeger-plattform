/** Integrationstests Verkauf & Dokumente (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Verkauf & Dokumente (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "vertrieb@example.com");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "bt-dok-"));
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());

    ids.g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 332, suchcode: "paulinenstrasse" })).body.id;
    ids.we = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "316930" })).body.id;
    ids.st = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "ST06", typ: "stellplatz", vkBrutto: "8000" })).body.id;
    ids.k = (await als(http.post("/api/partner")).send({ nr: 10929, suchcode: "muster", nachname: "Muster", rollen: ["interessent"] })).body.id;
  });

  afterAll(async () => app?.close());

  it("legt einen Kaufvertrag mit MaBV-Ratenplan an (Beispiel aus der Altsoftware)", async () => {
    const r = await als(http.post("/api/kaufvertraege")).send({
      projektId: ids.p,
      datum: "2015-11-27",
      urkundennr: "2015/3818",
      zahlungsanforderungAn: ids.k,
      kaeufer: [{ partnerId: ids.k, anteilProzent: "100" }],
      einheiten: [
        { einheitId: ids.we, vkBrutto: "316.930,00" },
        { einheitId: ids.st, vkBrutto: "8.000,00" },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.nr).toBe("KV-332-001");
    ids.v = r.body.id;
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(v.summen.vertragssumme).toBe("324930.00");
    expect(v.raten.map((x: { betrag: string }) => x.betrag)).toEqual(["97479.00", "90980.40", "61411.77", "20470.59", "36392.16", "6823.53", "11372.55"]);
    expect(v.raten.every((x: { status: string }) => x.status === "offen")).toBe(true);
    const partner = (await http.get(`/api/partner/${ids.k}`)).body;
    expect(partner.rollen).toContain("kunde");
  });

  it("verhindert den Doppelverkauf einer Einheit", async () => {
    const r = await als(http.post("/api/kaufvertraege")).send({
      projektId: ids.p,
      zahlungsanforderungAn: ids.k,
      kaeufer: [{ partnerId: ids.k }],
      einheiten: [{ einheitId: ids.st, vkBrutto: "8000" }],
    });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/bereits verkauft/);
    const projekt = (await http.get(`/api/projekte/${ids.p}`)).body;
    expect(projekt.uebersicht.wohnung.verkauft).toBe(1);
  });

  it("macht Raten erst nach Bautenstand UND Voraussetzungen anforderbar", async () => {
    await als(http.post(`/api/projekte/${ids.p}/bautenstand`)).send({ einheitIds: [ids.we, ids.st], abschnitt: "erdarbeiten", fertigAm: "2016-06-17" });
    let v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(v.raten[0].status).toBe("gesperrt");
    const zuFrueh = await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [v.raten[0].id], datum: "2016-06-17" });
    expect(zuFrueh.status).toBe(409);

    await als(http.put(`/api/kaufvertraege/${ids.v}/konditionen`)).send({
      zahlungsanforderungAn: ids.k,
      vertragWirksam: true,
      vormerkungEingetragenAm: "2016-06-15",
      lastenfreistellungGesichert: true,
      zahlungszielTage: 10,
    });
    v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(v.raten.map((x: { status: string }) => x.status).slice(0, 2)).toEqual(["anforderbar", "offen"]);
  });

  it("erstellt Zahlungsanforderungen mit fortlaufender Nummer und Fälligkeit", async () => {
    const sammel = await als(http.post(`/api/projekte/${ids.p}/zahlungsanforderungen`)).send({ datum: "2016-06-17" });
    expect(sammel.body.anzahl).toBe(1);
    const a = sammel.body.anforderungen[0];
    expect(a).toMatchObject({ rechnungsnr: "ZA-2016-00001", faelligAm: "2016-06-27", betrag: "97479.00" });
    ids.za1 = a.id;

    // Zwei Abschnitte melden → zwei Raten in einer Anforderung zusammenfassen
    for (const abschnitt of ["rohbau", "dach", "heizung", "sanitaer", "elektro", "fenster"])
      await als(http.post(`/api/projekte/${ids.p}/bautenstand`)).send({ einheitIds: [ids.we], abschnitt, fertigAm: "2016-12-01" });
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    const r = await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [v.raten[1].id, v.raten[2].id], datum: "2016-12-16" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ rechnungsnr: "ZA-2016-00002", betrag: "152392.17" });
    ids.za2 = r.body.id;
    const doppelt = await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [v.raten[1].id], datum: "2016-12-16" });
    expect(doppelt.status).toBe(409);
  });

  it("verbucht Zahlungseingänge und führt offene Posten", async () => {
    await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: ids.za1, datum: "2016-06-29", betrag: "97.479,00" });
    await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: ids.za2, datum: "2016-12-20", betrag: "100000" });
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    expect(v.raten.slice(0, 3).map((x: { status: string }) => x.status)).toEqual(["bezahlt", "bezahlt", "teilbezahlt"]);
    expect(v.summen).toMatchObject({ angefordert: "249871.17", bezahlt: "197479.00", offen: "52392.17" });
    const zuViel = await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: ids.za2, datum: "2016-12-21", betrag: "60000" });
    expect(zuViel.status).toBe(409);
    expect(zuViel.body.message).toMatch(/übersteigt den offenen Betrag von 52392,17/);
    const op = (await http.get("/api/offene-posten")).body;
    expect(op).toHaveLength(1);
    expect(op[0]).toMatchObject({ rechnungsnr: "ZA-2016-00002", offen: "52392.17" });
    expect(op[0].tageUeberfaellig).toBeGreaterThan(0);

    const druck = (await http.get(`/api/zahlungsanforderungen/${ids.za2}`)).body;
    expect(druck.raten.map((x: { nr: number }) => x.nr)).toEqual([2, 3]);
    expect(druck.empfaenger.nachname).toBe("Muster");
  });

  it("sperrt das Zurücknehmen von Bautenstand nach Anforderung", async () => {
    const bs = (await http.get(`/api/projekte/${ids.p}/bautenstand`)).body;
    const rohbau = bs.meldungen.find((m: { abschnitt: string }) => m.abschnitt === "rohbau");
    expect((await als(http.delete(`/api/bautenstand/${rohbau.id}`))).status).toBe(409);
  });

  it("lädt Dokumente hoch, liefert sie aus und blendet sie GoBD-konform aus", async () => {
    const up = await als(http.post("/api/dokumente"))
      .field("objektTyp", "kaufvertrag")
      .field("objektId", ids.v)
      .attach("datei", Buffer.from("%PDF-1.4 Kaufvertrag"), { filename: "Kaufvertrag Müller.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ dateiname: "Kaufvertrag Müller.pdf", groesse: 20 });
    expect(up.body.sha256).toHaveLength(64);
    const liste = (await http.get(`/api/dokumente?objektTyp=kaufvertrag&objektId=${ids.v}`)).body;
    expect(liste).toHaveLength(1);
    const datei = await http.get(`/api/dokumente/${up.body.id}/datei`).buffer(true);
    expect(datei.headers["content-type"]).toMatch(/pdf/);
    expect(Buffer.from(datei.body).toString()).toBe("%PDF-1.4 Kaufvertrag");
    expect((await als(http.delete(`/api/dokumente/${up.body.id}`))).status).toBe(200);
    expect((await http.get(`/api/dokumente?objektTyp=kaufvertrag&objektId=${ids.v}`)).body).toHaveLength(0);
    const fremd = await als(http.post("/api/dokumente")).field("objektTyp", "projekt").field("objektId", "00000000-0000-4000-8000-000000000000").attach("datei", Buffer.from("x"), "x.txt");
    expect(fremd.status).toBe(404);
  });
});
