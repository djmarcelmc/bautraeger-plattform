/** Integrationstests Bauabzugsteuer-Anmeldung (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { bauabzugFrist } from "@bt/domain";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const heute = new Date().toISOString().slice(0, 10);
const monat = heute.slice(0, 7);

describe.skipIf(!url)("Bauabzugsteuer (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "test@example.com");
  let gesellschaftId: string;
  let ohneFreistellung: string;
  let projektId: string;

  /** Vertrag mit einer geprüften, freigegebenen und heute bezahlten Rechnung. */
  async function bezahlteRechnung(handwerkerId: string, nr: number, betrag: string) {
    const gw = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr, bezeichnung: `Gewerk ${nr}` })).body.id;
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId, vertragBrutto: "50000" })).body.id;
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: `R-${nr}`, rechnungsdatum: heute, eingangAm: heute, betragBrutto: betrag })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: betrag });
    await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    const z = await als(http.post(`/api/eingangsrechnungen/${r}/zahlung`)).send({ datum: heute });
    expect(z.status).toBe(201);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrieren(url);
    const db = verbinden(url);
    await db.execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());
    gesellschaftId = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH", steuernummer: "99/123/45678" })).body.id;
    projektId = (await als(http.post("/api/projekte")).send({ gesellschaftId, nr: 101, suchcode: "LINDENWEG" })).body.id;
    ohneFreistellung = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"], steuernummer: "93815/08152", finanzamt: "Stuttgart II" })).body.id;
    const mitFreistellung = (await als(http.post("/api/partner")).send({ nr: 70002, suchcode: "elektro", firma: "Elektro AG", rollen: ["handwerker"], freistellungGueltigBis: "2099-12-31" })).body.id;
    await bezahlteRechnung(ohneFreistellung, 300, "10000");
    await bezahlteRechnung(ohneFreistellung, 310, "2000");
    await bezahlteRechnung(mitFreistellung, 400, "5000");
  });

  afterAll(async () => app?.close());

  it("zeigt den Monat mit Gegenleistung und Abzugsbetrag je Handwerker", async () => {
    const d = (await http.get("/api/bauabzug")).body;
    expect(d.monate).toHaveLength(1);
    const m = d.monate[0];
    expect(m).toMatchObject({ monat, faelligAm: bauabzugFrist(monat), offen: 1, summe: { gegenleistung: "12000.00", abzugsbetrag: "1800.00" } });
    expect(m.zeilen[0]).toMatchObject({ handwerkerId: ohneFreistellung, status: "offen", gegenleistung: "12000.00", abzugsbetrag: "1800.00" });
    expect(d.handwerker[0]).toMatchObject({ firma: "Rohbau KG", steuernummer: "93815/08152", finanzamt: "Stuttgart II" });
    expect(d.gesellschaften[0]).toMatchObject({ steuernummer: "99/123/45678" });
    // Erinnerung im Cockpit
    const c = (await http.get("/api/cockpit")).body;
    expect(c.aufgaben.find((a: { titel: string }) => a.titel.startsWith("Bauabzugsteuer anmelden"))).toMatchObject({ betrag: "1800.00", link: "/bauabzug" });
  });

  it("liefert den Abrechnungsbeleg mit allen Zahlungen", async () => {
    const b = await http.get(`/api/bauabzug/beleg?gesellschaftId=${gesellschaftId}&handwerkerId=${ohneFreistellung}&monat=${monat}`);
    expect(b.status).toBe(200);
    expect(b.body.zahlungen.map((z: { rechnungsnr: string; betrag: string; bauabzugsteuer: string }) => [z.rechnungsnr, z.betrag, z.bauabzugsteuer])).toEqual([
      ["R-300", "8500.00", "1500.00"],
      ["R-310", "1700.00", "300.00"],
    ]);
    expect(b.body.handwerker.firma).toBe("Rohbau KG");
    expect((await http.get(`/api/bauabzug/beleg?gesellschaftId=${gesellschaftId}&handwerkerId=${ohneFreistellung}&monat=2020-01`)).status).toBe(404);
  });

  it("erfasst Anmeldung und Abführung, erkennt spätere Zahlungen und nimmt zurück", async () => {
    const basis = { gesellschaftId, handwerkerId: ohneFreistellung, monat };
    expect((await als(http.post("/api/bauabzug/anmeldungen")).send({ ...basis, angemeldetAm: "" })).status).toBe(400);
    const a = await als(http.post("/api/bauabzug/anmeldungen")).send({ ...basis, angemeldetAm: heute });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ abzugsbetrag: "1800.00", gegenleistung: "12000.00", angemeldetVon: "test@example.com" });
    let m = (await http.get("/api/bauabzug")).body.monate[0];
    expect(m.zeilen[0].status).toBe("angemeldet");
    expect((await http.get("/api/cockpit")).body.aufgaben.find((x: { titel: string }) => x.titel.startsWith("Bauabzugsteuer abführen"))).toBeTruthy();

    const b = await als(http.post("/api/bauabzug/anmeldungen")).send({ ...basis, angemeldetAm: heute, abgefuehrtAm: heute });
    expect(b.body.id).toBe(a.body.id);
    m = (await http.get("/api/bauabzug")).body.monate[0];
    expect(m).toMatchObject({ offen: 0, nichtAbgefuehrt: 0 });
    expect((await http.get("/api/cockpit")).body.aufgaben.some((x: { titel: string }) => x.titel.startsWith("Bauabzugsteuer"))).toBe(false);

    // weitere Zahlung im selben Monat → Anmeldung weicht ab
    await bezahlteRechnung(ohneFreistellung, 320, "1000");
    m = (await http.get("/api/bauabzug")).body.monate[0];
    expect(m.zeilen[0]).toMatchObject({ status: "abweichung", abzugsbetrag: "1950.00" });
    expect(m.offen).toBe(1);

    const weg = await als(http.delete(`/api/bauabzug/anmeldungen/${a.body.id}`));
    expect(weg.status).toBe(200);
    expect((await http.get("/api/bauabzug")).body.monate[0].zeilen[0].status).toBe("offen");
  });
});
