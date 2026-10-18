/** Integrationstest Benachrichtigungen (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
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
import type { AusgehendeMail, MailVersand } from "./benachrichtigung/versand.js";

const url = process.env.TEST_DATABASE_URL;

/** Test-Versandweg: sammelt Mails, kann Fehler simulieren. */
class TestVersand implements MailVersand {
  readonly name = "smtp" as const;
  readonly beschreibung = "Test";
  gesendet: AusgehendeMail[] = [];
  fehler = 0;
  async senden(m: AusgehendeMail) {
    if (this.fehler > 0) {
      this.fehler--;
      throw new Error("Server nicht erreichbar");
    }
    this.gesendet.push(m);
    return true;
  }
}

describe.skipIf(!url)("Benachrichtigungen (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const versand = new TestVersand();
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
  let token: string;
  let wohnung: string;
  let vertragHw: string;
  let projektId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "mail-"));
    process.env.PUBLIC_URL = "https://projectx.cubivivit.de";
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const { MAIL_VERSAND } = await import("./benachrichtigung/versand.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_VERSAND).useValue(versand).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());

    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    projektId = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    wohnung = (await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "02", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "beispiel", anrede: "Herr", vorname: "Max", nachname: "Beispiel", email: "max@beispiel.de", rollen: ["kunde"] })).body.id;
    const kv = (await als(http.post("/api/kaufvertraege")).send({ projektId, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: wohnung, vkBrutto: "300000" }] })).body.id;
    token = (await als(http.post(`/api/kaufvertraege/${kv}/portal`)).send({})).body.token;
    const gw = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 334, bezeichnung: "Fenster" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "fenster", firma: "Fensterbau KG", rollen: ["handwerker"] })).body.id;
    vertragHw = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "50000" })).body.id;
  });

  afterAll(async () => app?.close());

  it("speichert Empfänger und prüft Adressen", async () => {
    expect((await als(http.put("/api/benachrichtigungen/einstellungen")).send({ maengelAn: "kein-mail" })).status).toBe(400);
    const r = await als(http.put("/api/benachrichtigungen/einstellungen")).send({ maengelAn: "bau@muster.de; gf@muster.de", aufgabenAn: "gf@muster.de", kaeuferInformieren: "on" });
    expect(r.body).toEqual({ maengelAn: ["bau@muster.de", "gf@muster.de"], aufgabenAn: ["gf@muster.de"], kaeuferInformieren: true });
    const d = (await http.get("/api/benachrichtigungen")).body;
    expect(d.versand).toEqual({ art: "smtp", beschreibung: "Test" });
  });

  it("informiert bei einer Mängelanzeige Bauleitung und Käufer", async () => {
    await http.post(`/api/portal/${token}/maengel`).field("einheitId", wohnung).field("titel", "Balkontür klemmt").field("ort", "Wohnzimmer");
    await app.get((await import("./benachrichtigung/nachrichten.service.js")).NachrichtenService).versendeAusstehende();
    expect(versand.gesendet.map((m) => m.an)).toEqual([["bau@muster.de", "gf@muster.de"], ["max@beispiel.de"]]);
    expect(versand.gesendet[0]!.betreff).toBe("Neue Mängelanzeige 101-1: Balkontür klemmt");
    expect(versand.gesendet[0]!.text).toContain("https://projectx.cubivivit.de/maengel/");
    expect(versand.gesendet[1]!.text).toMatch(/^Sehr geehrter Herr Beispiel,/);
  });

  it("informiert den Käufer bei 'in Bearbeitung' und 'erledigt', aber nicht doppelt", async () => {
    const mangel = (await http.get(`/api/maengel?projektId=${projektId}`)).body[0];
    const voll = (await http.get(`/api/maengel/${mangel.id}`)).body;
    const basis = { projektId, einheitId: wohnung, kaufvertragId: voll.kaufvertragId, eigentum: "sonder", festgestelltAm: voll.festgestelltAm, titel: voll.titel, ort: voll.ort, mangelart: "Kundenreklamation" };
    await als(http.put(`/api/maengel/${mangel.id}`)).send({ ...basis, handwerkervertragId: vertragHw });
    await als(http.post(`/api/maengel/${mangel.id}/ruegen`)).send({ geruegtAm: new Date().toISOString().slice(0, 10) });
    await als(http.post(`/api/maengel/${mangel.id}/erledigt`)).send({ erledigtAm: "2026-10-20" });
    await http.post("/api/benachrichtigungen/test").send({ an: "it@muster.de" }); // löst den Versand aus
    const status = versand.gesendet.filter((m) => m.betreff.startsWith("Mängelanzeige Nr."));
    expect(status.map((m) => m.betreff)).toEqual(["Mängelanzeige Nr. 101-1: in Bearbeitung", "Mängelanzeige Nr. 101-1: erledigt"]);
    expect(versand.gesendet.at(-1)!.betreff).toBe("Testnachricht der Bauträger-Plattform");
  });

  it("wiederholt fehlgeschlagene Sendungen und zeigt den Fehler im Postausgang", async () => {
    versand.fehler = 1;
    await http.post("/api/benachrichtigungen/test").send({ an: "it@muster.de" });
    let d = (await http.get("/api/benachrichtigungen")).body;
    expect(d.postausgang[0]).toMatchObject({ status: "wartend", versuche: 1, fehler: "Server nicht erreichbar" });
    expect(d.statistik.wartend).toBe(1);
    await http.post(`/api/benachrichtigungen/nachrichten/${d.postausgang[0].id}/erneut`);
    d = (await http.get("/api/benachrichtigungen")).body;
    expect(d.postausgang[0]).toMatchObject({ status: "gesendet", fehler: null });
  });

  it("verschickt die Aufgabenübersicht auf Wunsch sofort", async () => {
    const heute = new Date().toISOString().slice(0, 10);
    await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: vertragHw, rechnungsnr: "F-1", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "12000" });
    const r = (await http.post("/api/benachrichtigungen/aufgaben")).body;
    expect(r.eingereiht).toBe(true);
    const mail = versand.gesendet.at(-1)!;
    expect(mail.an).toEqual(["gf@muster.de"]);
    expect(mail.betreff).toMatch(/^Aufgaben am \d{2}\.\d{2}\.\d{4}:/);
    expect(mail.html).toContain("https://projectx.cubivivit.de/kosten?reiter=pruefen");
    expect(mail.text).toContain("1 Rechnung prüfen");
    // Der automatische Lauf verschickt sie danach am selben Tag nicht noch einmal
    const { NachrichtenService } = await import("./benachrichtigung/nachrichten.service.js");
    const { CockpitService } = await import("./cockpit/cockpit.controller.js");
    const auto = await app.get(NachrichtenService).aufgabenUebersicht(() => app.get(CockpitService).cockpit());
    expect(auto.eingereiht).toBe(false);
  });
});
