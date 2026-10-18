/**
 * Integrationstests gegen PostgreSQL. Laufen nur, wenn TEST_DATABASE_URL gesetzt ist
 * (die Datenbank wird dabei geleert!), z. B.:
 *   TEST_DATABASE_URL=postgres://bt:bt@localhost:5432/bautraeger_test pnpm test
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Stammdaten-API (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "test@example.com");

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
  });

  afterAll(async () => app?.close());

  let gesellschaftId: string;
  let projektId: string;

  it("legt eine Gesellschaft an und lehnt doppelte Nummern ab", async () => {
    const r = await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH", datevBeraternr: "1234567" });
    expect(r.status).toBe(201);
    gesellschaftId = r.body.id;
    const doppelt = await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Doppelt" });
    expect(doppelt.status).toBe(409);
    expect(doppelt.body.message).toMatch(/bereits vergeben/);
  });

  it("validiert Projekte mit verständlichen Fehlern", async () => {
    const r = await als(http.post("/api/projekte")).send({ gesellschaftId, nr: "abc", suchcode: "" });
    expect(r.status).toBe(400);
    expect(r.body.fehler.join(" ")).toMatch(/suchcode: Pflichtfeld/);
  });

  it("legt ein Projekt an, schlägt Nummern vor, sucht und ändert mit Protokoll", async () => {
    const nr = await http.get(`/api/projekte/naechste-nr?gesellschaftId=${gesellschaftId}`);
    expect(nr.body.nr).toBe(101);
    const r = await als(http.post("/api/projekte")).send({ gesellschaftId, nr: 101, suchcode: "lindenweg", ort: "Stuttgart" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ suchcode: "LINDENWEG", kostenstelle: "101" });
    projektId = r.body.id;

    const suche = await http.get("/api/projekte?suche=stutt");
    expect(suche.body.map((x: { nr: number }) => x.nr)).toEqual([101]);

    const put = await als(http.put(`/api/projekte/${projektId}`)).send({ gesellschaftId, nr: 101, suchcode: "LINDENWEG", ort: "Esslingen" });
    expect(put.status).toBe(200);
    const historie = await http.get(`/api/protokoll/${projektId}`);
    expect(historie.body[0]).toMatchObject({ aktion: "update", alt: { ort: "Stuttgart" }, neu: { ort: "Esslingen" }, benutzer: "test@example.com" });
    expect(historie.body).toHaveLength(2);
  });

  it("verwaltet Einheiten mit Stellplatz-Zuordnung und Übersicht", async () => {
    const we = await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "01", typ: "wohnung", wohnflaeche: "97,64", vkBrutto: "312.448,00" });
    expect(we.status).toBe(201);
    expect(we.body).toMatchObject({ wohnflaeche: "97.64", vkBrutto: "312448.00" });
    const st = await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "ST06", typ: "stellplatz", vkBrutto: "8000", zugehoerigZuEinheitId: we.body.id });
    expect(st.status).toBe(201);
    const doppelt = await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "01", typ: "wohnung" });
    expect(doppelt.status).toBe(409);

    const projekt = await http.get(`/api/projekte/${projektId}`);
    expect(projekt.body.einheiten).toHaveLength(2);
    expect(projekt.body.uebersicht).toEqual({ wohnung: { anzahl: 1, verkauft: 0 }, stellplatz: { anzahl: 1, verkauft: 0 } });
  });

  it("kopiert ein Projekt samt Einheiten und Zuordnungen", async () => {
    const r = await als(http.post(`/api/projekte/${projektId}/kopieren`)).send({ nr: 102, suchcode: "lindenweg-2", einheitenKopieren: true });
    expect(r.status).toBe(201);
    expect(r.body.kopiert).toEqual({ einheiten: 2, gewerke: 0 });
    const kopie = await http.get(`/api/projekte/${r.body.id}`);
    const we = kopie.body.einheiten.find((x: { nr: string }) => x.nr === "01");
    const st = kopie.body.einheiten.find((x: { nr: string }) => x.nr === "ST06");
    expect(st.zugehoerigZuEinheitId).toBe(we.id);
  });

  it("löscht Einheiten und protokolliert das", async () => {
    const projekt = await http.get(`/api/projekte/${projektId}`);
    const st = projekt.body.einheiten.find((x: { nr: string }) => x.nr === "ST06");
    const del = await als(http.delete(`/api/einheiten/${st.id}`));
    expect(del.status).toBe(200);
    const historie = await http.get(`/api/protokoll/${st.id}`);
    expect(historie.body[0]).toMatchObject({ aktion: "delete", alt: { nr: "ST06" } });
  });

  it("verwaltet Geschäftspartner mit Rollenfilter und IBAN-Prüfung", async () => {
    const falsch = await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"], iban: "DE00" });
    expect(falsch.status).toBe(400);
    const ok = await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"], iban: "DE89 3704 0044 0532 0130 00" });
    expect(ok.status).toBe(201);
    await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "flaschner", firma: "Flaschnerei Beispiel", rollen: ["handwerker"] });
    const handwerker = await http.get("/api/partner?rolle=handwerker");
    expect(handwerker.body.map((x: { suchcode: string }) => x.suchcode)).toEqual(["FLASCHNER"]);
    expect((await http.get("/api/partner/naechste-nr")).body.nr).toBe(70002);
  });
});
