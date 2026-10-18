/** Integrationstests Kosten (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Kosten (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
  const ids: Record<string, string> = {};

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
    ids.g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 287, suchcode: "markomannenstrasse" })).body.id;
    ids.hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau-muster", firma: "Rohbau Muster KG", rollen: ["lieferant"] })).body.id;
  });

  afterAll(async () => app?.close());

  it("legt den Gewerkeplan aus der Vorlage an (nur einmal)", async () => {
    const r = await als(http.post(`/api/projekte/${ids.p}/gewerkeplan`)).send({ budgetBrutto: "4.000.000,00" });
    expect(r.body.angelegt).toBe(65);
    expect((await als(http.post(`/api/projekte/${ids.p}/gewerkeplan`)).send({ budgetBrutto: "1000" })).status).toBe(409);
    const k = (await http.get(`/api/projekte/${ids.p}/kosten`)).body;
    const rohbau = k.gewerke.find((x: { nr: number }) => x.nr === 300);
    expect(rohbau.stand).toMatchObject({ geschaetzt: "493200.00", trend: "493200.00" });
    ids.rohbau = rohbau.id;
  });

  it("vergibt einen Handwerkervertrag mit Konditionen", async () => {
    const r = await als(http.post("/api/handwerkervertraege")).send({
      gewerkId: ids.rohbau,
      handwerkerId: ids.hw,
      nrIntern: "23180",
      vertragBrutto: "100.000,00",
      nachlassProzent: "3",
      skontoProzent: "2",
      skontoFristTage: 14,
      zahlungsfristTage: 30,
      umlagen: { wasser: "0,3", strom: "0,3", bauschutt: "0,9" },
      einbehaltVertragserfuellungProzent: "5",
      einbehaltGewaehrleistungProzent: "5",
      gewaehrleistungMonate: 60,
    });
    expect(r.status).toBe(201);
    ids.v = r.body.id;
    expect((await http.get(`/api/partner/${ids.hw}`)).body.rollen).toContain("handwerker");
    await als(http.post(`/api/handwerkervertraege/${ids.v}/nachtraege`)).send({ text: "Zusätzliche Kellerabdichtung", betragBrutto: "5.000", status: "beauftragt" });
    await als(http.post(`/api/handwerkervertraege/${ids.v}/nachtraege`)).send({ text: "Angebot Mehrmengen", betragBrutto: "8.000" });
  });

  it("rechnet die 1. Abschlagsrechnung mit Skonto und Bauabzugsteuer ab", async () => {
    const r = await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: ids.v, rechnungsnr: "AR-1", rechnungsdatum: "2026-09-30", eingangAm: "2026-10-01", betragBrutto: "40.000,00" });
    expect(r.status).toBe(201);
    ids.r1 = r.body.id;
    expect((await als(http.post(`/api/eingangsrechnungen/${ids.r1}/freigeben`))).status).toBe(409);
    expect((await als(http.post(`/api/eingangsrechnungen/${ids.r1}/pruefen`)).send({ geprueftKumuliert: "41.000" })).status).toBe(400);
    const geprueft = await als(http.post(`/api/eingangsrechnungen/${ids.r1}/pruefen`)).send({ geprueftKumuliert: "40.000,00" });
    expect(geprueft.body.status).toBe("rechnerisch_geprueft");
    expect(geprueft.body.vorschau.freistellungGueltig).toBe(false);
    await als(http.post(`/api/eingangsrechnungen/${ids.r1}/freigeben`));
    const bezahlt = (await als(http.post(`/api/eingangsrechnungen/${ids.r1}/zahlung`)).send({ datum: "2026-10-10" })).body;
    expect(bezahlt.status).toBe("bezahlt");
    expect(bezahlt.zahlung).toMatchObject({ betrag: "30219.57", skonto: "725.56", bauabzugsteuer: "5332.87" });
    expect(bezahlt.pruefergebnis).toMatchObject({ nachlass: "1200.00", umlagen: "582.00", einbehalt: "1940.00", faellig: "36278.00" });
  });

  it("rechnet die 2. Rechnung kumuliert ab – ohne Skonto (Frist verpasst), mit Freistellung", async () => {
    await als(http.put(`/api/partner/${ids.hw}`)).send({ nr: 70001, suchcode: "rohbau-muster", firma: "Rohbau Muster KG", rollen: ["handwerker"], freistellungGueltigBis: "2027-12-31" });
    ids.r2 = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: ids.v, rechnungsnr: "AR-2", rechnungsdatum: "2026-10-31", eingangAm: "2026-11-01", betragBrutto: "100000" })).body.id;
    const zuFrueh = await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: ids.v, rechnungsnr: "AR-3", rechnungsdatum: "2026-11-15", eingangAm: "2026-11-16", betragBrutto: "120000" });
    expect(zuFrueh.status).toBe(409);
    expect(zuFrueh.body.message).toMatch(/AR-2 .* noch nicht bezahlt/);
    await als(http.post(`/api/eingangsrechnungen/${ids.r2}/pruefen`)).send({ geprueftKumuliert: "98.000", bemerkung: "Pos. 12 gekürzt" });
    await als(http.post(`/api/eingangsrechnungen/${ids.r2}/freigeben`));
    const vorschau = (await http.get(`/api/eingangsrechnungen/${ids.r2}?zahlungsdatum=2026-11-30`)).body.vorschau;
    expect(vorschau).toMatchObject({ skontoMoeglich: false, freistellungGueltig: true, skontoFristBis: "2026-11-15" });
    const bezahlt = (await als(http.post(`/api/eingangsrechnungen/${ids.r2}/zahlung`)).send({ datum: "2026-11-30" })).body;
    expect(bezahlt.zahlung).toMatchObject({ betrag: "52603.10", skonto: "0.00", bauabzugsteuer: "0.00" });
    expect(bezahlt.pruefergebnis).toMatchObject({ anspruchKumuliert: "88881.10", bisherAbgegolten: "36278.00" });
  });

  it("zeigt den Kostenstand in der Kostenkontrolle und im Rechnungseingangsbuch", async () => {
    const k = (await http.get(`/api/projekte/${ids.p}/kosten`)).body;
    const rohbau = k.gewerke.find((x: { nr: number }) => x.nr === 300);
    expect(rohbau.stand).toMatchObject({
      vergeben: "100000.00",
      nachtraege: "5000.00",
      summeVergeben: "105000.00",
      trend: "105000.00",
      abweichung: "388200.00",
      berechnet: "98000.00",
      bezahlt: "88881.10",
    });
    expect(Number(k.summe.geschaetzt)).toBeGreaterThan(3_990_000);
    const v = (await http.get(`/api/handwerkervertraege/${ids.v}`)).body;
    expect(v.summen).toMatchObject({ auftrag: "105000.00", ausgezahlt: "82822.67", bauabzugsteuer: "5332.87", restBerechnet: "9118.90" });
    const buch = (await http.get("/api/eingangsrechnungen?status=bezahlt")).body;
    expect(buch.map((x: { rechnungsnr: string }) => x.rechnungsnr)).toEqual(["AR-1", "AR-2"]);
    expect((await http.get("/api/eingangsrechnungen?status=erfasst,rechnerisch_geprueft,freigegeben")).body).toHaveLength(0);
  });

  it("verhindert das Löschen eines vergebenen Gewerks", async () => {
    const r = await als(http.delete(`/api/gewerke/${ids.rohbau}`));
    expect(r.status).toBe(409);
  });

  it("meldet klar, wenn eine Rechnung durch frühere Zahlungen bereits abgegolten ist", async () => {
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: ids.rohbau, handwerkerId: ids.hw, vertragBrutto: "10000" })).body.id;
    const r1 = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "X-1", rechnungsdatum: "2026-10-01", eingangAm: "2026-10-01", betragBrutto: "5000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r1}/pruefen`)).send({ geprueftKumuliert: "5000" });
    await als(http.post(`/api/eingangsrechnungen/${r1}/freigeben`));
    await als(http.post(`/api/eingangsrechnungen/${r1}/zahlung`)).send({ datum: "2026-10-02" });
    const r2 = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "X-2", rechnungsdatum: "2026-10-05", eingangAm: "2026-10-05", betragBrutto: "6000" })).body.id;
    const p = await als(http.post(`/api/eingangsrechnungen/${r2}/pruefen`)).send({ geprueftKumuliert: "4000" });
    expect(p.status).toBe(201);
    expect(p.body.vorschau.ohneSkonto.faellig).toBe("-1000.00");
    expect((await als(http.post(`/api/eingangsrechnungen/${r2}/freigeben`))).status).toBe(201);
    const z = await als(http.post(`/api/eingangsrechnungen/${r2}/zahlung`)).send({ datum: "2026-10-06" });
    expect(z.status).toBe(409);
    expect(z.body.message).toMatch(/kein Zahlbetrag offen/i);
  });

  it("warnt bei Überschreitung des Auftrags inkl. Nachträgen und verlangt bei der Freigabe eine Bestätigung", async () => {
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: ids.rohbau, handwerkerId: ids.hw, vertragBrutto: "20000" })).body.id;
    await als(http.post(`/api/handwerkervertraege/${v}/nachtraege`)).send({ text: "Mehrmengen Beton", betragBrutto: "2000", status: "beauftragt" });
    await als(http.post(`/api/handwerkervertraege/${v}/nachtraege`)).send({ text: "Zusatzleistung Drainage", betragBrutto: "3000" });
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "U-1", rechnungsdatum: "2026-10-01", eingangAm: "2026-10-01", betragBrutto: "24000" })).body.id;
    const d = (await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "24000" })).body;
    expect(d.auftragsrahmen).toMatchObject({ stufe: "ueber", auftrag: "22000.00", angeboten: "3000.00", ueberschreitung: "2000.00" });
    expect(d.auftragsrahmen.text).toMatch(/Angebotene Nachträge über 3\.000,00 € würden das decken/);
    const ohne = await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    expect(ohne.status).toBe(409);
    expect(ohne.body.message).toMatch(/Freigabe nur mit ausdrücklicher Bestätigung/);
    expect((await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`)).send({ ueberschreitungBestaetigt: true })).status).toBe(201);
    const prot = (await http.get(`/api/protokoll/${r}`)).body as { neu: Record<string, unknown> }[];
    expect(prot.some((x) => x.neu?.auftragUeberschritten === "2000.00")).toBe(true);
    // geprüfter Betrag innerhalb des Auftrags → keine Bestätigung nötig, ab 90 % Hinweis
    const v2 = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: ids.rohbau, handwerkerId: ids.hw, vertragBrutto: "10000" })).body.id;
    const r2 = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v2, rechnungsnr: "U-2", rechnungsdatum: "2026-10-01", eingangAm: "2026-10-01", betragBrutto: "9500" })).body.id;
    expect((await als(http.post(`/api/eingangsrechnungen/${r2}/pruefen`)).send({ geprueftKumuliert: "9500" })).body.auftragsrahmen).toMatchObject({ stufe: "nahe", auslastungProzent: 95 });
    expect((await als(http.post(`/api/eingangsrechnungen/${r2}/freigeben`))).status).toBe(201);
  });

  it("warnt je Gewerk vor Budgetüberschreitung – Kostenkontrolle, Rechnung und Cockpit, Schwelle einstellbar", async () => {
    const gw = (await als(http.post(`/api/projekte/${ids.p}/gewerke`)).send({ nr: 999, bezeichnung: "Außenanlagen Test", geschaetztBrutto: "50000" })).body.id;
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: ids.hw, vertragBrutto: "46000" })).body.id;
    const zeile = async () => (await http.get(`/api/projekte/${ids.p}/kosten`)).body.gewerke.find((x: { id: string }) => x.id === gw);
    expect((await zeile()).budget).toMatchObject({ stufe: "nahe", auslastungProzent: 92, gebunden: "46000.00" });
    const cockpit = (await http.get("/api/cockpit")).body.aufgaben as { titel: string; link: string }[];
    expect(cockpit.find((a) => a.titel === "Budget fast ausgeschöpft: 999 Außenanlagen Test")?.link).toBe(`/gewerke/${gw}?projekt=${ids.p}`);

    // Rechnung über Budget: Vorschau zählt den kumulierten Betrag bereits vor der Prüfung
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "B-1", rechnungsdatum: "2026-10-01", eingangAm: "2026-10-01", betragBrutto: "53000" })).body.id;
    const d = (await http.get(`/api/eingangsrechnungen/${r}`)).body;
    expect(d.budget).toMatchObject({ stufe: "ueber", ueberschreitung: "3000.00", auslastungProzent: 106 });
    expect(d.budget.text).toMatch(/Budget um 3\.000 € überschritten/);
    expect((await zeile()).budget.stufe).toBe("nahe"); // ungeprüft noch nicht im Stand

    // Schwelle anheben → kein Hinweis mehr; ungültige Werte werden abgelehnt
    expect((await http.get("/api/einstellungen/kosten")).body).toEqual({ budgetSchwelleProzent: 90 });
    expect((await als(http.put("/api/einstellungen/kosten")).send({ budgetSchwelleProzent: 30 })).status).toBe(400);
    expect((await als(http.put("/api/einstellungen/kosten")).send({ budgetSchwelleProzent: "95" })).body).toEqual({ budgetSchwelleProzent: 95 });
    expect((await zeile()).budget.stufe).toBe("ok");
    expect((await http.get(`/api/projekte/${ids.p}/kosten`)).body.budgetSchwelleProzent).toBe(95);
  });

  it("schichtet Budget zwischen Gewerken um – höchstens das freie Budget, protokolliert", async () => {
    const k = (await http.get(`/api/projekte/${ids.p}/kosten`)).body;
    const ziel = k.gewerke.find((x: { nr: number }) => x.nr === 999); // 50.000 geschätzt, 46.000 vergeben, Rechnung 53.000 offen
    const quelle = k.gewerke.find((x: { nr: number }) => x.nr === 300); // Rohbau mit großer Einsparung
    const zuviel = await als(http.post(`/api/projekte/${ids.p}/budgetumbuchungen`)).send({ vonGewerkId: ziel.id, nachGewerkId: quelle.id, betrag: "5000", begruendung: "Test" });
    expect(zuviel.status).toBe(409);
    expect(zuviel.body.message).toMatch(/nur 4\.000,00 € freies Budget/);
    expect((await als(http.post(`/api/projekte/${ids.p}/budgetumbuchungen`)).send({ vonGewerkId: quelle.id, nachGewerkId: quelle.id, betrag: "1", begruendung: "x" })).status).toBe(400);
    const r = await als(http.post(`/api/projekte/${ids.p}/budgetumbuchungen`)).send({ vonGewerkId: quelle.id, nachGewerkId: ziel.id, betrag: "5.000,00", begruendung: "Einsparung Rohbau für Außenanlagen" });
    expect(r.status).toBe(201);
    const nachher = (await http.get(`/api/projekte/${ids.p}/kosten`)).body;
    const z2 = nachher.gewerke.find((x: { id: string }) => x.id === ziel.id);
    expect(z2.stand.geschaetzt).toBe("55000.00");
    expect(nachher.gewerke.find((x: { id: string }) => x.id === quelle.id).stand.geschaetzt).toBe((Number(quelle.stand.geschaetzt) - 5000).toFixed(2));
    expect(nachher.summe.geschaetzt).toBe(k.summe.geschaetzt); // Gesamtbudget unverändert
    expect(z2.budget).toMatchObject({ stufe: "ok", auslastungProzent: 84 }); // 46.000 von 55.000
    expect(z2).toMatchObject({ umgebucht: "5000.00", budgetUrspruenglich: "50000.00" });
    expect(nachher.gewerke.find((x: { id: string }) => x.id === quelle.id)).toMatchObject({ umgebucht: "-5000.00", budgetUrspruenglich: quelle.stand.geschaetzt });
    expect(nachher.umbuchungen).toBe(1);
    const bericht = (await http.get(`/api/auswertungen/kostenreport/${ids.p}`)).body;
    expect(bericht.umbuchungsliste).toHaveLength(1);
    const xlsx = await http.get(`/api/auswertungen/kostenreport/${ids.p}?format=xlsx`);
    expect(xlsx.status).toBe(200);
    expect((await http.get(`/api/auswertungen/projektbericht/${ids.p}`)).body.kosten.umbuchungen).toBe(1);
    const liste = (await http.get(`/api/projekte/${ids.p}/budgetumbuchungen`)).body;
    expect(liste[0]).toMatchObject({ betrag: "5000.00", begruendung: "Einsparung Rohbau für Außenanlagen", von: { nr: 300 }, nach: { nr: 999 } });
    const prot = (await http.get(`/api/protokoll/${ziel.id}`)).body as { neu: Record<string, unknown> }[];
    expect(prot.some((x) => x.neu?.umbuchung === r.body.id)).toBe(true);
  });
});

