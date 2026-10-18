/** Integrationstest Cockpit (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const tage = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)("Cockpit (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "gf@example.com");

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
    const p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    const w1 = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const w2 = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "02", typ: "wohnung", vkBrutto: "200000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"] })).body.id;
    const k2 = (await als(http.post("/api/partner")).send({ nr: 10002, suchcode: "beispiel", nachname: "Beispiel", rollen: ["kunde"] })).body.id;
    const vertrag = { vertragWirksam: true, vormerkungEingetragenAm: tage(-90), lastenfreistellungGesichert: true };
    await als(http.post("/api/kaufvertraege")).send({ projektId: p, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: w1, vkBrutto: "300000" }], ...vertrag });
    // Erdarbeiten für W1 gemeldet → angefordert vor 30 Tagen, nichts bezahlt → überfällig
    await als(http.post(`/api/projekte/${p}/bautenstand`)).send({ einheitIds: [w1], abschnitt: "erdarbeiten", fertigAm: tage(-35) });
    await als(http.post(`/api/projekte/${p}/zahlungsanforderungen`)).send({ datum: tage(-30) });
    // Zweiter Vertrag: Erdarbeiten gemeldet, noch nicht angefordert → anforderbar
    await als(http.post("/api/kaufvertraege")).send({ projektId: p, zahlungsanforderungAn: k2, kaeufer: [{ partnerId: k2 }], einheiten: [{ einheitId: w2, vkBrutto: "200000" }], ...vertrag });
    await als(http.post(`/api/projekte/${p}/bautenstand`)).send({ einheitIds: [w2], abschnitt: "erdarbeiten", fertigAm: tage(-1) });

    // Rechnung erfasst vor 10 Tagen → prüfen (hoch)
    const gw = (await als(http.post(`/api/projekte/${p}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"] })).body.id;
    const hv = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "100000", skontoProzent: "2", skontoFristTage: "14" })).body.id;
    await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: hv, rechnungsnr: "AR-1", rechnungsdatum: tage(-10), eingangAm: tage(-10), betragBrutto: "20000" });

    // Mangel mit abgelaufener Rügefrist
    const mg = (await als(http.post("/api/maengel")).send({ projektId: p, handwerkervertragId: hv, titel: "Riss in Bodenplatte", festgestelltAm: tage(-40) })).body.id;
    await als(http.post(`/api/maengel/${mg}/ruegen`)).send({ geruegtAm: tage(-30), fristBis: tage(-16) });

    // Abgelaufene Bürgschaft, Bauzeitenplan mit Verzug
    await als(http.post("/api/buergschaften")).send({ richtung: "erhalten", art: "vertragserfuellung", handwerkervertragId: hv, betrag: "5000", gueltigBis: tage(-2) });
    await als(http.post(`/api/projekte/${p}/vorgaenge`)).send({ bezeichnung: "Rohbau", beginn: tage(-60), ende: tage(-5), mabvAbschnitt: "rohbau" });
  });

  afterAll(async () => app?.close());

  it("sammelt Aufgaben aus allen Bereichen, sortiert nach Dringlichkeit", async () => {
    const d = (await http.get("/api/cockpit")).body;
    const titel = d.aufgaben.map((a: { titel: string }) => a.titel);
    expect(titel).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Zahlung überfällig: ZA-/),
        expect.stringMatching(/^Raten anfordern: KV-101-002/),
        "1 Rechnung prüfen",
        "Mängelfrist überschritten: 101-1",
        "Bürgschaft abgelaufen",
        "1 Vorgang über Plan-Ende",
        expect.stringMatching(/^Bautenstand prüfen: 2\. nach Rohbaufertigstellung/),
      ]),
    );
    const ueberfaellig = d.aufgaben.find((a: { titel: string }) => a.titel.startsWith("Zahlung überfällig"));
    expect(ueberfaellig).toMatchObject({ dringlichkeit: "hoch", betrag: "90000.00", projekt: "101 LINDENWEG", link: "/verkauf?reiter=mahnwesen" });
    expect(d.aufgaben.find((a: { titel: string }) => a.titel.startsWith("Raten anfordern"))).toMatchObject({ dringlichkeit: "mittel", betrag: "60000.00" });
    expect(d.aufgaben.find((a: { titel: string }) => a.titel === "1 Rechnung prüfen").dringlichkeit).toBe("hoch");
    // hoch vor mittel vor info
    const rang = { hoch: 0, mittel: 1, info: 2 } as Record<string, number>;
    const raenge = d.aufgaben.map((a: { dringlichkeit: string }) => rang[a.dringlichkeit]);
    expect(raenge).toEqual([...raenge].sort((a, b) => a - b));
    expect(d.anzahl.hoch).toBeGreaterThanOrEqual(4);
    expect(d.kennzahlen).toMatchObject({ projekte: 1, offeneForderungen: "90000.00", ueberfaellig: "90000.00", offeneMaengel: 1 });
  });
});
