/** Integrationstests Sonderwünsche (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Sonderwünsche (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "vertrieb@example.com");
  const ids: Record<string, string> = {};
  const vertrag = async () => (await http.get(`/api/kaufvertraege/${ids.v}`)).body;

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
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "LINDENWEG" })).body.id;
    const anderes = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 102, suchcode: "ANDERES" })).body.id;
    ids.fremdesGewerk = (await als(http.post(`/api/projekte/${anderes}/gewerke`)).send({ nr: 600, bezeichnung: "Heizung" })).body.id;
    ids.gewerk = (await als(http.post(`/api/projekte/${ids.p}/gewerke`)).send({ nr: 600, bezeichnung: "Heizung" })).body.id;
    ids.we = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "W01", typ: "wohnung", vkBrutto: "100000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"] })).body.id;
    ids.v = (await als(http.post("/api/kaufvertraege")).send({ projektId: ids.p, datum: "2026-01-15", zahlungsanforderungAn: k, kaeufer: [{ partnerId: k, anteilProzent: "100" }], einheiten: [{ einheitId: ids.we, vkBrutto: "100000" }] })).body.id;
    await als(http.put(`/api/kaufvertraege/${ids.v}/konditionen`)).send({ zahlungsanforderungAn: k, vertragWirksam: true, vormerkungEingetragenAm: "2026-02-01", lastenfreistellungGesichert: true, zahlungszielTage: 10 });
    await als(http.post(`/api/projekte/${ids.p}/bautenstand`)).send({ einheitIds: [ids.we], abschnitt: "erdarbeiten", fertigAm: "2026-03-01" });
  });

  afterAll(async () => app?.close());

  it("legt Angebote an und prüft Eingaben", async () => {
    const url = `/api/kaufvertraege/${ids.v}/sonderwuensche`;
    expect((await als(http.post(url)).send({ bezeichnung: "", betragBrutto: "0" })).status).toBe(400);
    expect((await als(http.post(url)).send({ bezeichnung: "x", betragBrutto: "10", gewerkId: ids.fremdesGewerk })).status).toBe(400);
    const a = await als(http.post(url)).send({ bezeichnung: "Fußbodenheizung Bad", beschreibung: "elektrisch, mit Thermostat", betragBrutto: "2.380,00", kostenBrutto: "1700", gewerkId: ids.gewerk, gueltigBis: "2099-12-31" });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ nr: 1, status: "angebot", art: "zusatzleistung", betragBrutto: "2380.00" });
    ids.sw1 = a.body.id;
    ids.sw2 = (await als(http.post(url)).send({ art: "gutschrift", bezeichnung: "Entfall Kellertür", betragBrutto: "450" })).body.id;
    ids.sw3 = (await als(http.post(url)).send({ bezeichnung: "Parkett statt Fliesen", betragBrutto: "5000", abschnitt: "estrich" })).body.id;
    const geaendert = await als(http.put(`/api/sonderwuensche/${ids.sw3}`)).send({ bezeichnung: "Parkett Eiche statt Fliesen", betragBrutto: "5200", abschnitt: "estrich" });
    expect(geaendert.body).toMatchObject({ nr: 3, betragBrutto: "5200.00" });
    const d = (await http.get(`/api/sonderwuensche/${ids.sw1}`)).body;
    expect(d).toMatchObject({ vertrag: { nr: expect.any(String) }, empfaenger: { nachname: "Muster" }, abgelaufen: false, rate: null });
  });

  it("legt bei Beauftragung Raten an – sofort oder mit dem Bauabschnitt anforderbar", async () => {
    for (const id of [ids.sw1, ids.sw2, ids.sw3]) expect((await als(http.post(`/api/sonderwuensche/${id}/beauftragen`)).send({ datum: "2026-10-01" })).status).toBe(201);
    expect((await als(http.post(`/api/sonderwuensche/${ids.sw1}/beauftragen`)).send({ datum: "2026-10-01" })).status).toBe(409);
    expect((await als(http.put(`/api/sonderwuensche/${ids.sw1}`)).send({ bezeichnung: "x", betragBrutto: "1" })).status).toBe(409);
    const v = await vertrag();
    const extra = v.raten.filter((r: { typ: string }) => r.typ !== "mabv");
    expect(extra.map((r: { nr: number; betrag: string; status: string; text: string }) => [r.nr, r.betrag, r.status])).toEqual([
      [8, "2380.00", "anforderbar"],
      [9, "-450.00", "anforderbar"],
      [10, "5200.00", "offen"],
    ]);
    expect(v.summen).toMatchObject({ vertragssumme: "100000.00", sonderwuensche: "7130.00", gesamt: "107130.00", nichtAngefordert: "107130.00" });
    expect(v.sonderwuensche).toHaveLength(3);
    // Gutschrift allein nicht anforderbar
    const nurGutschrift = await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [extra[1].id], datum: "2026-10-05" });
    expect(nurGutschrift.status).toBe(409);
    expect(nurGutschrift.body.message).toMatch(/Gutschriften werden mit einer Rate verrechnet/);
  });

  it("verrechnet die Gutschrift in der Anforderung und ordnet Zahlungen richtig zu", async () => {
    const s = await als(http.post(`/api/projekte/${ids.p}/zahlungsanforderungen`)).send({ datum: "2026-10-05" });
    expect(s.body.anzahl).toBe(1);
    const a = s.body.anforderungen[0];
    expect(a.betrag).toBe("31930.00"); // 30.000 Erdarbeiten + 2.380 − 450
    // ohne Zahlung bleiben alle Raten „angefordert“
    expect((await vertrag()).raten.filter((r: { betrag: string; zahlungsanforderungId: string | null }) => r.zahlungsanforderungId && Number(r.betrag) > 0).map((r: { status: string }) => r.status)).toEqual(["angefordert", "angefordert"]);
    await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: a.id, datum: "2026-10-10", betrag: "31930" });
    const v = await vertrag();
    expect(v.raten.filter((r: { zahlungsanforderungId: string | null }) => r.zahlungsanforderungId).map((r: { status: string; bezahlt: string }) => [r.status, r.bezahlt])).toEqual([
      ["bezahlt", "30000.00"],
      ["bezahlt", "2380.00"],
      ["bezahlt", "-450.00"],
    ]);
    expect(v.summen).toMatchObject({ offen: "0.00", nichtAngefordert: "75200.00" });
    const druck = (await http.get(`/api/zahlungsanforderungen/${a.id}`)).body;
    expect(druck.raten.map((r: { text: string | null }) => r.text).slice(1)).toEqual(["Sonderwunsch Nr. 1: Fußbodenheizung Bad", "Gutschrift Nr. 2: Entfall Kellertür"]);
  });

  it("setzt zurück, lehnt ab, löscht und listet mit Summen", async () => {
    expect((await als(http.post(`/api/sonderwuensche/${ids.sw1}/zuruecksetzen`))).status).toBe(409);
    expect((await als(http.delete(`/api/sonderwuensche/${ids.sw3}`))).status).toBe(409);
    const z = await als(http.post(`/api/sonderwuensche/${ids.sw3}/zuruecksetzen`));
    expect(z.body).toMatchObject({ status: "angebot", rateId: null });
    expect((await vertrag()).raten.some((r: { nr: number }) => r.nr === 10)).toBe(false);
    expect((await als(http.post(`/api/sonderwuensche/${ids.sw3}/ablehnen`)).send({ datum: "2026-10-12" })).body.status).toBe("abgelehnt");

    const l = (await http.get(`/api/sonderwuensche?projektId=${ids.p}`)).body;
    expect(l.sonderwuensche.map((x: { nr: number; status: string }) => [x.nr, x.status])).toEqual([
      [1, "beauftragt"],
      [2, "beauftragt"],
      [3, "abgelehnt"],
    ]);
    expect(l.summen).toMatchObject({ beauftragt: "1930.00", zusatzleistungen: "2380.00", gutschriften: "450.00", marge: "680.00", offeneAngebote: 0 });
    expect((await http.get("/api/sonderwuensche?status=abgelehnt")).body.sonderwuensche).toHaveLength(1);
    expect((await als(http.delete(`/api/sonderwuensche/${ids.sw3}`))).status).toBe(200);
  });
});
