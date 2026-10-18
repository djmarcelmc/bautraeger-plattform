/** Integrationstests: Schreiben als PDF per E-Mail (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
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

class TestVersand implements MailVersand {
  readonly name = "microsoft365" as const;
  readonly beschreibung = "Test";
  gesendet: AusgehendeMail[] = [];
  async senden(m: AusgehendeMail) {
    this.gesendet.push(m);
    return true;
  }
}

describe.skipIf(!url)("Schreiben per E-Mail (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const versand = new TestVersand();
  const als = (r: request.Test) => r.set("x-benutzer", "vertrieb@example.com");
  const ids: Record<string, string> = {};
  const pdf = Buffer.from("%PDF-1.7\n% Testschreiben\n%%EOF");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOKUMENTE_PFAD = mkdtempSync(join(tmpdir(), "schreiben-"));
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
    const p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    const we = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "02", typ: "wohnung", vkBrutto: "100000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "beispiel", anrede: "Herr", vorname: "Max", nachname: "Beispiel", email: "max@beispiel.de", rollen: ["kunde"] })).body.id;
    ids.kv = (await als(http.post("/api/kaufvertraege")).send({ projektId: p, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: we, vkBrutto: "100000" }] })).body.id;
    await als(http.put(`/api/kaufvertraege/${ids.kv}/konditionen`)).send({ zahlungsanforderungAn: k, vertragWirksam: true, vormerkungEingetragenAm: "2026-02-01", lastenfreistellungGesichert: true, zahlungszielTage: 10 });
    await als(http.post(`/api/projekte/${p}/bautenstand`)).send({ einheitIds: [we], abschnitt: "erdarbeiten", fertigAm: "2026-03-01" });
    ids.za = (await als(http.post(`/api/projekte/${p}/zahlungsanforderungen`)).send({ datum: "2026-10-05" })).body.anforderungen[0].id;
    ids.sw = (await als(http.post(`/api/kaufvertraege/${ids.kv}/sonderwuensche`)).send({ bezeichnung: "Parkett Eiche", betragBrutto: "5200", gueltigBis: "2026-11-30" })).body.id;
  });

  afterAll(async () => app?.close());

  it("schlägt Empfänger, Betreff und Text vor", async () => {
    const v = (await http.get(`/api/schreiben/zahlungsanforderung/${ids.za}`)).body;
    expect(v).toMatchObject({
      an: ["max@beispiel.de"],
      ohneEmail: [],
      betreff: "Zahlungsanforderung ZA-2026-00001 – Bauvorhaben LINDENWEG, Wohneinheit 02",
      dateiname: "ZA-2026-00001.pdf",
      versandweg: { art: "microsoft365" },
      vermerke: [],
    });
    expect(v.text).toMatch(/^Sehr geehrter Herr Beispiel,\n\nanbei erhalten Sie unsere Zahlungsanforderung ZA-2026-00001 über 30\.000,00 €/);
    const sw = (await http.get(`/api/schreiben/sonderwunsch/${ids.sw}`)).body;
    expect(sw.betreff).toBe("Angebot: Parkett Eiche – Bauvorhaben LINDENWEG, Wohneinheit 02");
    expect(sw.text).toContain("das Angebot gilt bis zum 30.11.2026");
    expect((await http.get(`/api/schreiben/mahnung/${ids.za}`)).status).toBe(404);
    expect((await http.get(`/api/schreiben/rechnung/${ids.za}`)).status).toBe(404);
  });

  it("legt das PDF am Kaufvertrag ab und versendet es als Anhang", async () => {
    const url = `/api/schreiben/zahlungsanforderung/${ids.za}/versenden`;
    const kein = await als(http.post(url)).field("an", "max@beispiel.de").field("betreff", "x").field("text", "y").attach("datei", Buffer.from("<html>"), "x.pdf");
    expect(kein.status).toBe(400);
    expect((await als(http.post(url)).field("an", "kaputt").field("betreff", "x").field("text", "y").attach("datei", pdf, "x.pdf")).status).toBe(400);

    const r = await als(http.post(url)).field("an", "max@beispiel.de, buchhaltung@muster.de").field("betreff", "Ihre Zahlungsanforderung").field("text", "Sehr geehrter Herr Beispiel,\n\nanbei.\n\nGrüße").attach("datei", pdf, "egal.pdf");
    expect(r.status).toBe(201);
    expect(r.body.dateiname).toBe("ZA-2026-00001.pdf");

    const dok = (await http.get(`/api/dokumente?objektTyp=kaufvertrag&objektId=${ids.kv}`)).body;
    expect(dok).toHaveLength(1);
    expect(dok[0]).toMatchObject({ dateiname: "ZA-2026-00001.pdf", ordner: "Schriftverkehr", mimeType: "application/pdf", beschreibung: "per E-Mail an max@beispiel.de, buchhaltung@muster.de" });

    const { NachrichtenService } = await import("./benachrichtigung/nachrichten.service.js");
    await app.get(NachrichtenService).versendeAusstehende();
    expect(versand.gesendet).toHaveLength(1);
    const m = versand.gesendet[0]!;
    expect(m).toMatchObject({ an: ["max@beispiel.de", "buchhaltung@muster.de"], betreff: "Ihre Zahlungsanforderung" });
    expect(m.html).toContain("anbei.");
    expect(m.anhaenge).toHaveLength(1);
    expect(m.anhaenge![0]).toMatchObject({ dateiname: "ZA-2026-00001.pdf", typ: "application/pdf" });
    expect(m.anhaenge![0]!.inhalt.equals(pdf)).toBe(true);

    const vermerke = (await http.get(`/api/schreiben/zahlungsanforderung/${ids.za}`)).body.vermerke;
    expect(vermerke[0]).toMatchObject({ status: "gesendet", anlass: "schreiben_zahlungsanforderung", an: ["max@beispiel.de", "buchhaltung@muster.de"] });
  });
});
