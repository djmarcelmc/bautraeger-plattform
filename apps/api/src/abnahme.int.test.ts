/** Integrationstests Abnahmen und Mängelvorlagen (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { STANDARD_MAENGEL } from "@bt/domain";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Abnahmen und Mängelvorlagen (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
  let projektId: string;
  let kaufvertrag: string;
  let wohnung: string;
  let vertrag: string;
  let abnahmeSE: string;

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

    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    projektId = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    const tg = (await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "TG1", typ: "stellplatz", vkBrutto: "20000" })).body.id;
    wohnung = (await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", vorname: "Erika", nachname: "Muster", rollen: ["kunde"] })).body.id;
    kaufvertrag = (await als(http.post("/api/kaufvertraege")).send({ projektId, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: tg, vkBrutto: "20000" }, { einheitId: wohnung, vkBrutto: "300000" }] })).body.id;
    await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 355, bezeichnung: "Fliesenarbeiten" });
    const maler = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 337, bezeichnung: "Maler" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "maler", firma: "Maler Bunt", rollen: ["handwerker"] })).body.id;
    vertrag = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: maler, handwerkerId: hw, vertragBrutto: "40000" })).body.id;
  });

  afterAll(async () => app?.close());

  it("übernimmt den Standardkatalog einmalig und verwaltet Vorlagen", async () => {
    expect((await als(http.post("/api/mangelvorlagen/standard"))).body.angelegt).toBe(STANDARD_MAENGEL.length);
    expect((await als(http.post("/api/mangelvorlagen/standard"))).status).toBe(409);
    const neu = await als(http.post("/api/mangelvorlagen")).send({ kategorie: "Schließanlage", gewerkNr: "", titel: "Schlüssel fehlt" });
    expect(neu.body).toMatchObject({ gewerkNr: null, titel: "Schlüssel fehlt" });
    expect((await http.get("/api/mangelvorlagen")).body).toHaveLength(STANDARD_MAENGEL.length + 1);
    expect((await als(http.delete(`/api/mangelvorlagen/${neu.body.id}`))).status).toBe(200);
  });

  it("legt die Abnahme Sondereigentum an und belegt die Wohnung vor", async () => {
    expect((await als(http.post(`/api/projekte/${projektId}/abnahmen`)).send({ art: "sondereigentum", datum: "2027-07-09" })).status).toBe(400);
    const res = await als(http.post(`/api/projekte/${projektId}/abnahmen`)).send({
      art: "sondereigentum",
      datum: "2027-07-09",
      kaufvertragId: kaufvertrag,
      teilnehmer: "Erika Muster (Käuferin)\nH. Bau (Bauleitung)",
      schluessel: "3 Wohnungsschlüssel, 1 Briefkastenschlüssel",
      zaehler: { strom: "12,4", wasserKalt: "0,8" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nr: 1, einheitId: wohnung, zaehler: { strom: "12,4", wasserKalt: "0,8" } });
    abnahmeSE = res.body.id;
  });

  it("erfasst Mängel aus Vorlagen und frei, mit Gewerk über die Nummer", async () => {
    const vorlagen = (await http.get("/api/mangelvorlagen")).body as { id: string; kategorie: string; titel: string }[];
    const fliese = vorlagen.find((v) => v.titel === "Fliese gesprungen")!;
    const reinigung = vorlagen.find((v) => v.titel === "Endreinigung unzureichend")!;
    const res = await als(http.post(`/api/abnahmen/${abnahmeSE}/maengel`)).send({ vorlageIds: [fliese.id, reinigung.id], ort: "Bad", titel: "Kratzer an Wohnungstür", beschreibung: "Türblatt außen" });
    expect(res.body.angelegt).toBe(3);
    const d = (await http.get(`/api/abnahmen/${abnahmeSE}`)).body;
    expect(d.maengel).toHaveLength(3);
    expect(d.maengel[0]).toMatchObject({ titel: "Fliese gesprungen", ort: "Bad", gewerk: "355 Fliesenarbeiten", status: "neu" });
    expect(d.maengel[1].gewerk).toBeNull();
    expect(d.kaufvertrag.kaeufer[0].nachname).toBe("Muster");
    expect(d.einheit.nr).toBe("01");
    const m = (await http.get(`/api/maengel?projektId=${projektId}`)).body[0];
    expect(m).toMatchObject({ mangelart: "Abnahmemangel", eigentum: "sonder", einheit: "01" });
    expect((await als(http.delete(`/api/abnahmen/${abnahmeSE}`))).status).toBe(409);
  });

  it("schließt ab, setzt Übergabe und Gewährleistung und sperrt Änderungen", async () => {
    const res = await als(http.post(`/api/abnahmen/${abnahmeSE}/abschliessen`)).send({ ergebnis: "vorbehalt", vorbehaltVertragsstrafe: "on" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ergebnis: "vorbehalt", vorbehaltVertragsstrafe: true, gewaehrleistungMonate: 60 });
    expect(res.body.folgen[0]).toMatch(/Gewährleistung bis 2032-07-09/);
    const kv = (await http.get(`/api/kaufvertraege/${kaufvertrag}`)).body;
    expect(kv.gewaehrleistungBis).toBe("2032-07-09");
    expect(kv.uebergabeIst).toMatch(/^2027-07-09/);
    expect((await als(http.post(`/api/abnahmen/${abnahmeSE}/maengel`)).send({ titel: "noch einer" })).status).toBe(409);
    expect((await als(http.post(`/api/abnahmen/${abnahmeSE}/abschliessen`)).send({ ergebnis: "abgenommen" })).status).toBe(409);
  });

  it("übernimmt bei der Handwerkerabnahme Abnahmedatum und Handwerker in die Mängel", async () => {
    const a = (await als(http.post(`/api/projekte/${projektId}/abnahmen`)).send({ art: "handwerker", datum: "2027-05-03", handwerkervertragId: vertrag })).body;
    expect(a.nr).toBe(2);
    await als(http.post(`/api/abnahmen/${a.id}/maengel`)).send({ titel: "Treppenhaus Wand fleckig", ort: "Treppenhaus 2. OG" });
    const d = (await http.get(`/api/abnahmen/${a.id}`)).body;
    expect(d.maengel[0]).toMatchObject({ gewerk: "337 Maler", handwerker: "Maler Bunt" });
    const res = await als(http.post(`/api/abnahmen/${a.id}/abschliessen`)).send({ ergebnis: "abgenommen", gewaehrleistungMonate: "48" });
    expect(res.body.folgen[0]).toMatch(/Gewährleistung 48 Monate/);
    expect((await http.get(`/api/handwerkervertraege/${vertrag}`)).body).toMatchObject({ abnahmeAm: "2027-05-03", gewaehrleistungMonate: 48 });
  });

  it("ändert bei verweigerter Abnahme nichts am Vertrag und listet Abnahmen", async () => {
    const a = (await als(http.post(`/api/projekte/${projektId}/abnahmen`)).send({ art: "gemeinschaftseigentum", datum: "2027-09-01" })).body;
    const res = await als(http.post(`/api/abnahmen/${a.id}/abschliessen`)).send({ ergebnis: "verweigert" });
    expect(res.body.folgen).toEqual([]);
    expect((await http.get(`/api/projekte/${projektId}`)).body.fertigstellungIst).toBeNull();
    const liste = (await http.get(`/api/abnahmen?projektId=${projektId}`)).body;
    expect(liste.map((x: { nr: number; maengel: number }) => [x.nr, x.maengel])).toEqual([
      [1, 3],
      [2, 1],
      [3, 0],
    ]);
    expect(liste[0]).toMatchObject({ artText: "Abnahme Sondereigentum (Käufer)", bezug: expect.stringMatching(/^Kaufvertrag/), maengelOffen: 3 });
  });
});
