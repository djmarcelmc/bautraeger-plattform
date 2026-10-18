/** Integrationstests Käuferportal (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
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
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

describe.skipIf(!url)("Käuferportal (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "vertrieb@example.com");
  let kaufvertrag: string;
  let wohnung: string;
  let fremdeEinheit: string;
  let token: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "portal-"));
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());

    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    const p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg", strasse: "Lindenweg 5", plz: "70173", ort: "Stuttgart" })).body.id;
    wohnung = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    fremdeEinheit = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "02", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", anrede: "Frau", vorname: "Erika", nachname: "Muster", rollen: ["kunde"] })).body.id;
    kaufvertrag = (await als(http.post("/api/kaufvertraege")).send({ projektId: p, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: wohnung, vkBrutto: "300000" }] })).body.id;
  });

  afterAll(async () => app?.close());

  it("erzeugt einen Link, speichert nur den Hash und widerruft den alten", async () => {
    expect((await http.get(`/api/kaufvertraege/${kaufvertrag}/portal`)).body).toEqual({ aktiv: null, meldungen: 0 });
    const alt = (await als(http.post(`/api/kaufvertraege/${kaufvertrag}/portal`)).send({})).body.token;
    const res = await als(http.post(`/api/kaufvertraege/${kaufvertrag}/portal`)).send({ gueltigBis: "2031-12-31" });
    token = res.body.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.body.gueltigBis).toBe("2031-12-31");
    expect((await http.get(`/api/portal/${alt}`)).status).toBe(404);
    const zeilen = await verbinden(url!).execute(sql`select token_hash from portalzugang where widerrufen_am is null`);
    expect(JSON.stringify(zeilen)).not.toContain(token);
    expect((await http.get(`/api/kaufvertraege/${kaufvertrag}/portal`)).body.aktiv).toMatchObject({ gueltigBis: "2031-12-31", abgelaufen: false });
  });

  it("zeigt dem Käufer Objekt und Einheiten ohne interne Daten", async () => {
    const d = (await http.get(`/api/portal/${token}`)).body;
    expect(d).toMatchObject({ objekt: { strasse: "Lindenweg 5", ort: "Stuttgart" }, bautraeger: { name: "Muster Wohnbau GmbH" }, kaeufer: ["Frau Erika Muster"], einheiten: [{ nr: "01" }], maengel: [] });
    expect(JSON.stringify(d)).not.toMatch(/vkBrutto|300000|handwerker/i);
    expect((await http.get("/api/portal/ungueltig-aber-lang-genug-123")).status).toBe(404);
    expect((await http.get("/api/portal/../kaufvertraege")).status).toBe(404);
  });

  it("nimmt Meldungen mit Fotos an und prüft Einheit und Dateiformat", async () => {
    const melden = (felder: Record<string, string>, fotos: [Buffer, string][] = []) => {
      let r = http.post(`/api/portal/${token}/maengel`);
      for (const [k, v] of Object.entries(felder)) r = r.field(k, v);
      for (const [b, n] of fotos) r = r.attach("fotos", b, n);
      return r;
    };
    expect((await melden({ einheitId: fremdeEinheit, titel: "Test" })).status).toBe(403);
    expect((await melden({ einheitId: wohnung, titel: "Test" }, [[Buffer.from("<svg onload=alert(1)>"), "x.jpg"]])).status).toBe(400);
    const ok = await melden({ einheitId: wohnung, titel: "Fenster Wohnzimmer undicht", ort: "Wohnzimmer", beschreibung: "Bei Regen läuft Wasser ein.", kontakt: "0711 123456, vormittags" }, [
      [JPEG, "IMG_0001.JPG"],
      [JPEG, "IMG_0002.JPG"],
    ]);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ nr: 1, fotos: 2 });

    const d = (await http.get(`/api/portal/${token}`)).body;
    expect(d.maengel[0]).toMatchObject({ nr: 1, titel: "Fenster Wohnzimmer undicht", status: "eingegangen" });
    const intern = (await http.get(`/api/maengel?status=offen`)).body[0];
    expect(intern).toMatchObject({ mangelart: "Kundenreklamation", einheit: "01", fotos: 2 });
    const mangel = (await http.get(`/api/maengel/${intern.id}`)).body;
    expect(mangel.beschreibung).toContain("Erreichbarkeit: 0711 123456");
    expect(mangel.festgestelltDurch).toBe("Käuferportal");

    const cockpit = (await http.get("/api/cockpit")).body;
    expect(cockpit.aufgaben.map((a: { titel: string }) => a.titel)).toContain("Mängelanzeige vom Käufer: 101-1");
    expect((await http.get(`/api/kaufvertraege/${kaufvertrag}/portal`)).body.meldungen).toBe(1);
  });

  it("begrenzt Meldungen je Tag und sperrt widerrufene Links", async () => {
    for (let i = 0; i < 9; i++) await http.post(`/api/portal/${token}/maengel`).field("einheitId", wohnung).field("titel", `Mangel ${i}`);
    const zuViel = await http.post(`/api/portal/${token}/maengel`).field("einheitId", wohnung).field("titel", "noch einer");
    expect(zuViel.status).toBe(429);
    await als(http.delete(`/api/kaufvertraege/${kaufvertrag}/portal`));
    expect((await http.get(`/api/portal/${token}`)).status).toBe(404);
  });
});
