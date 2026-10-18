/** Integrationstest Rechte bei aktiver Anmeldung (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
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

describe.skipIf(!url)("Rechte und Vier-Augen-Prinzip (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test, benutzer: string, rollen: string) => r.set("x-benutzer", benutzer).set("x-rollen", rollen);
  const gf = (r: request.Test) => als(r, "gf@muster.de", "Bautraeger.Geschaeftsfuehrung");
  let projektId: string;
  let vertrag: string;
  let token: string;
  let wohnung: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "rechte-"));
    process.env.AUTH_AKTIV = "true";
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());

    const g = (await gf(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    projektId = (await gf(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    wohnung = (await gf(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await gf(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"] })).body.id;
    const kv = (await gf(http.post("/api/kaufvertraege")).send({ projektId, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: wohnung, vkBrutto: "300000" }] })).body.id;
    token = (await gf(http.post(`/api/kaufvertraege/${kv}/portal`)).send({})).body.token;
    const gw = (await gf(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau" })).body.id;
    const hw = (await gf(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"] })).body.id;
    vertrag = (await gf(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "100000" })).body.id;
  });

  afterAll(async () => {
    delete process.env.AUTH_AKTIV;
    await app?.close();
  });

  it("verlangt Anmeldung und Rolle", async () => {
    expect((await http.get("/api/projekte")).status).toBe(401);
    expect((await als(http.get("/api/projekte"), "x@muster.de", "Unbekannt.Rolle")).status).toBe(401);
    expect((await http.get("/api/health")).status).toBe(200);
  });

  it("lässt den Steuerberater lesen, aber nichts ändern", async () => {
    const stb = (r: request.Test) => als(r, "stb@kanzlei.de", "Bautraeger.Steuerberater");
    expect((await stb(http.get("/api/projekte"))).status).toBe(200);
    expect((await stb(http.get(`/api/auswertungen/liquiditaet`))).status).toBe(200);
    const res = await stb(http.post("/api/partner")).send({ nr: 10002, suchcode: "x", nachname: "X", rollen: ["kunde"] });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/^Keine Berechtigung: „Geschäftspartner anlegen und ändern“ ist .*Geschäftsführung.* vorbehalten\.$/);
  });

  it("trennt Prüfung und Freigabe (Vier-Augen-Prinzip) und Zahlung nach Rolle", async () => {
    const bau = (r: request.Test) => als(r, "bau@muster.de", "Bautraeger.Bauleitung");
    const heute = new Date().toISOString().slice(0, 10);
    const r = (await bau(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: vertrag, rechnungsnr: "AR-1", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "10000" })).body.id;
    expect((await bau(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "10000" })).status).toBe(201);
    expect((await bau(http.post(`/api/eingangsrechnungen/${r}/freigeben`))).status).toBe(403);
    // GF mit beiden Rollen prüft und gibt selbst frei → Vier-Augen
    const chef = (r2: request.Test) => als(r2, "bau@muster.de", "Bautraeger.Geschaeftsfuehrung,Bautraeger.Bauleitung");
    const selbst = await chef(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    expect(selbst.status).toBe(409);
    expect(selbst.body.message).toMatch(/Vier-Augen-Prinzip/);
    expect((await gf(http.post(`/api/eingangsrechnungen/${r}/freigeben`))).status).toBe(201);
    expect((await als(http.post(`/api/eingangsrechnungen/${r}/zahlung`), "vertrieb@muster.de", "Bautraeger.Vertrieb").send({ datum: heute })).status).toBe(403);
    expect((await als(http.post(`/api/eingangsrechnungen/${r}/zahlung`), "buha@muster.de", "Bautraeger.Buchhaltung").send({ datum: heute })).status).toBe(201);
    const protokoll = (await gf(http.get(`/api/protokoll/${r}`))).body.map((p: { benutzer: string }) => p.benutzer);
    expect(protokoll).toEqual(expect.arrayContaining(["bau@muster.de", "gf@muster.de", "buha@muster.de"]));
  });

  it("lässt das Käuferportal ohne Anmeldung zu", async () => {
    expect((await http.get(`/api/portal/${token}`)).status).toBe(200);
    expect((await http.post(`/api/portal/${token}/maengel`).field("einheitId", wohnung).field("titel", "Tür klemmt")).status).toBe(201);
  });
});
