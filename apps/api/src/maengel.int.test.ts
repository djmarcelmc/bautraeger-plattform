/** Integrationstests Mängel (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
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

describe.skipIf(!url)("Mängel (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
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
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 382, suchcode: "hanseaten-21" })).body.id;
    ids.p2 = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 383, suchcode: "anderes" })).body.id;
    ids.e = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "01", typ: "wohnung" })).body.id;
    ids.hw = (await als(http.post("/api/partner")).send({ nr: 70229, suchcode: "flaschner-bsp", firma: "Flaschnerei Beispiel", rollen: ["handwerker"] })).body.id;
    ids.gw = (await als(http.post(`/api/projekte/${ids.p}/gewerke`)).send({ nr: 130, bezeichnung: "Flaschner / Klempner", geschaetztBrutto: "50000" })).body.id;
    ids.v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: ids.gw, handwerkerId: ids.hw, vertragBrutto: "48000", abnahmeAm: "2021-03-01", gewaehrleistungMonate: 60 })).body.id;
  });

  afterAll(async () => app?.close());

  it("erfasst einen Mangel und übernimmt Handwerker und Gewerk aus dem Vertrag", async () => {
    const r = await als(http.post("/api/maengel")).send({
      projektId: ids.p,
      handwerkervertragId: ids.v,
      eigentum: "gemeinschaft",
      festgestelltAm: "2025-02-08",
      festgestelltDurch: "Gutachten SV Hr. Maier",
      titel: "Entwässerung Dach überarbeiten",
      ort: "Dach, Ablauf Nord",
      mangelart: "Gewährleistungsmangel",
      wertHandwerkerBrutto: "200,00",
      einbehalt: true,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nr: 1, handwerkerId: ids.hw, gewerkId: ids.gw });
    ids.m = r.body.id;
    const m = (await http.get(`/api/maengel/${ids.m}`)).body;
    expect(m).toMatchObject({ status: "neu", gewaehrleistungAbgelaufen: false, vertrag: { gewaehrleistungBis: "2026-03-01" } });
    expect(m.naechsteRuege.stufe).toBe(1);
    const v = (await http.get(`/api/handwerkervertraege/${ids.v}`)).body;
    expect(v.maengel).toEqual({ offen: 1, einbehalt: "200.00" });
  });

  it("lehnt Bezüge aus einem anderen Projekt ab", async () => {
    const r = await als(http.post("/api/maengel")).send({ projektId: ids.p2, handwerkervertragId: ids.v, festgestelltAm: "2025-02-08", titel: "x" });
    expect(r.status).toBe(400);
    const e = await als(http.post("/api/maengel")).send({ projektId: ids.p2, einheitId: ids.e, festgestelltAm: "2025-02-08", titel: "x" });
    expect(e.status).toBe(400);
  });

  it("rügt höchstens dreimal mit Standard- oder eigener Frist", async () => {
    const r1 = await als(http.post(`/api/maengel/${ids.m}/ruegen`)).send({ geruegtAm: "2025-03-05", fristBis: "2025-03-20" });
    expect(r1.body).toMatchObject({ stufe: 1, fristBis: "2025-03-20" });
    const r2 = await als(http.post(`/api/maengel/${ids.m}/ruegen`)).send({ geruegtAm: "2025-05-06" });
    expect(r2.body).toMatchObject({ stufe: 2, fristBis: "2025-05-16" });
    expect((await als(http.post(`/api/maengel/${ids.m}/ruegen`)).send({ geruegtAm: "2025-04-01" })).status).toBe(400);
    await als(http.post(`/api/maengel/${ids.m}/ruegen`)).send({ geruegtAm: "2025-07-01", fristBis: "2025-07-15" });
    const r4 = await als(http.post(`/api/maengel/${ids.m}/ruegen`)).send({ geruegtAm: "2025-08-01" });
    expect(r4.status).toBe(409);
    expect(r4.body.message).toMatch(/Ersatzvornahme/);
    const m = (await http.get(`/api/maengel/${ids.m}`)).body;
    expect(m.status).toBe("ueberfaellig");
    expect(m.ruegen.map((x: { stufe: number }) => x.stufe)).toEqual([1, 2, 3]);
  });

  it("listet offene und überfällige Mängel mit Fristen", async () => {
    await als(http.post("/api/maengel")).send({ projektId: ids.p, einheitId: ids.e, festgestelltAm: "2026-10-01", titel: "Dachziegel fehlen", ort: "Dach Süd" });
    const offen = (await http.get(`/api/maengel?projektId=${ids.p}`)).body;
    expect(offen.map((x: { nr: number; status: string }) => [x.nr, x.status])).toEqual([[1, "ueberfaellig"], [2, "neu"]]);
    expect(offen[0]).toMatchObject({ ruegen: 3, fristBis: "2025-07-15", handwerker: "Flaschnerei Beispiel", gewerk: "Flaschner / Klempner" });
    const ueber = (await http.get("/api/maengel?status=ueberfaellig")).body;
    expect(ueber).toHaveLength(1);
    expect((await http.get("/api/maengel?suche=ziegel")).body).toHaveLength(1);
  });

  it("verlangt einen Handwerker für eine Rüge", async () => {
    const offen = (await http.get(`/api/maengel?projektId=${ids.p}`)).body;
    const r = await als(http.post(`/api/maengel/${offen[1].id}/ruegen`)).send({ geruegtAm: "2026-10-02" });
    expect(r.status).toBe(409);
  });

  it("erledigt und eröffnet Mängel wieder, Fotos werden angehängt", async () => {
    const foto = await als(http.post("/api/dokumente")).field("objektTyp", "mangel").field("objektId", ids.m).attach("datei", Buffer.from([0xff, 0xd8, 0xff]), { filename: "ablauf.jpg", contentType: "image/jpeg" });
    expect(foto.status).toBe(201);
    const erledigt = (await als(http.post(`/api/maengel/${ids.m}/erledigt`)).send({ erledigtAm: "2025-07-20", erledigtVon: "SV Maier (Nachbegehung)" })).body;
    expect(erledigt).toMatchObject({ status: "erledigt", erledigtVon: "SV Maier (Nachbegehung)", naechsteRuege: null });
    expect((await http.get(`/api/handwerkervertraege/${ids.v}`)).body.maengel).toEqual({ offen: 0, einbehalt: "0" });
    const liste = (await http.get(`/api/maengel?status=erledigt`)).body;
    expect(liste[0]).toMatchObject({ nr: 1, fotos: 1 });
    expect((await als(http.post(`/api/maengel/${ids.m}/wiedereroeffnen`))).body.status).toBe("ueberfaellig");
  });
});
