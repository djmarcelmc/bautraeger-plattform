/** Integrationstests Bauzeitenplan und Liquiditätsplan (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const zahl = (s: string) => Number(s);

describe.skipIf(!url)("Bauzeitenplan und Liquiditätsplan (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
  let projektId: string;
  let rohbauGewerk: string;
  let fremdesGewerk: string;

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
    const anderes = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 102, suchcode: "anderes" })).body.id;
    fremdesGewerk = (await als(http.post(`/api/projekte/${anderes}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau" })).body.id;

    const we = (await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    await als(http.post(`/api/projekte/${projektId}/einheiten`)).send({ nr: "TG1", typ: "stellplatz", vkBrutto: "20000" });
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"] })).body.id;
    await als(http.post("/api/kaufvertraege")).send({
      projektId,
      zahlungsanforderungAn: k,
      kaeufer: [{ partnerId: k }],
      einheiten: [{ einheitId: we, vkBrutto: "310000" }],
      vertragWirksam: true,
      vormerkungEingetragenAm: "2026-04-01",
      lastenfreistellungGesichert: true,
    });
    await als(http.post(`/api/projekte/${projektId}/bautenstand`)).send({ einheitIds: [we], abschnitt: "erdarbeiten", fertigAm: "2026-05-01" });
    const za = (await als(http.post(`/api/projekte/${projektId}/zahlungsanforderungen`)).send({ datum: "2026-05-02" })).body.anforderungen[0].id; // 93.000
    await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: za, datum: "2026-05-10", betrag: "50000" });

    // Rohbau: vergeben 180.000, davon 50.000 geprüft und bezahlt → Rest 130.000 nach Bauzeitenplan
    rohbauGewerk = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau", geschaetztBrutto: "200000" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"] })).body.id;
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: rohbauGewerk, handwerkerId: hw, vertragBrutto: "180000" })).body.id;
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "AR-1", rechnungsdatum: "2026-06-01", eingangAm: "2026-06-01", betragBrutto: "50000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "50000" });
    await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    await als(http.post(`/api/eingangsrechnungen/${r}/zahlung`)).send({ datum: "2026-06-05" });
    // Gewerk ohne Vorgang in der Vorlage
    await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 999, bezeichnung: "Kunst am Bau", geschaetztBrutto: "10000" });
  });

  afterAll(async () => app?.close());

  it("legt den Bauzeitenplan aus der Vorlage an und verknüpft Gewerke", async () => {
    const res = await als(http.post(`/api/projekte/${projektId}/bauzeitenplan`)).send({ baubeginn: "2026-11-02" });
    expect(res.status).toBe(201);
    expect(res.body.angelegt).toBe(25);
    expect((await als(http.post(`/api/projekte/${projektId}/bauzeitenplan`)).send({ baubeginn: "2026-11-02" })).status).toBe(409);

    const plan = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body;
    const rohbau = plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Rohbau");
    expect(rohbau).toMatchObject({ beginn: "2026-11-23", ende: "2027-03-12", gewerke: [{ nr: 300 }] });
    const erd = plan.vorgaenge.find((v: { mabvAbschnitt: string }) => v.mabvAbschnitt === "erdarbeiten");
    expect(erd).toMatchObject({ meilenstein: "2026-11-02", gemeldet: 1 });
    expect(plan.einheiten).toBe(2);
    expect(plan.gewerkeOhneVorgang.map((x: { nr: number }) => x.nr)).toEqual([999]);
  });

  it("prüft Vorgänge (Abschnitt nur einmal, Gewerke aus dem Projekt, Datumsfolge)", async () => {
    const basis = { bezeichnung: "Test", beginn: "2027-01-04", ende: "2027-01-15" };
    expect((await als(http.post(`/api/projekte/${projektId}/vorgaenge`)).send({ ...basis, mabvAbschnitt: "dach" })).body.message).toMatch(/bereits einem anderen Vorgang/);
    expect((await als(http.post(`/api/projekte/${projektId}/vorgaenge`)).send({ ...basis, gewerkIds: [fremdesGewerk] })).status).toBe(400);
    expect((await als(http.post(`/api/projekte/${projektId}/vorgaenge`)).send({ ...basis, ende: "2027-01-01" })).body.fehler[0]).toMatch(/Ende liegt vor dem Beginn/);
    const neu = await als(http.post(`/api/projekte/${projektId}/vorgaenge`)).send({ ...basis, gewerkIds: rohbauGewerk });
    expect(neu.status).toBe(201);
    expect(neu.body).toMatchObject({ nr: 260, gewerkIds: [rohbauGewerk] });
    expect((await als(http.delete(`/api/vorgaenge/${neu.body.id}`))).status).toBe(200);
  });

  it("berechnet den Liquiditätsplan nach Kalenderwochen", async () => {
    const res = await http.get(`/api/auswertungen/liquiditaetsplan?projektId=${projektId}&stichtag=2026-10-19&wochen=26&anfangsbestand=100.000,00`);
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.wochen).toHaveLength(26);
    expect(d.wochen[0]).toMatchObject({ jahr: 2026, woche: 43, von: "2026-10-19" });
    // Überfällig angefordert: 93.000 − 50.000
    expect(d.ueberfaellig.ein).toBe("43000.00");
    expect(d.wochen[0].ein.angefordert).toBe("43000.00");
    // Rohbau-Rest 130.000 über 16 Wochen ab 23.11.
    const kw48 = d.wochen.find((w: { von: string }) => w.von === "2026-11-23");
    expect(kw48.aus.bauleistung).toBe("8125.00");
    // Summen: alle Einnahmen = offene Kaufpreise, alle Ausgaben = Kostenrest
    const alle = (r: "ein" | "aus") => d.wochen.reduce((s: number, w: { einSumme: string; ausSumme: string }) => s + zahl(r === "ein" ? w.einSumme : w.ausSumme), 0) + zahl(d.spaeter[r]) + zahl(d.ohneTermin[r]);
    expect(alle("ein")).toBeCloseTo(310000 - 50000, 2);
    expect(alle("aus")).toBeCloseTo(130000 + 10000, 2);
    expect(d.arten.aus).toContain("ohnePlan");
    expect(zahl(d.wochen[0].bestand)).toBeCloseTo(100000 + 43000 - zahl(d.wochen[0].ausSumme), 2);
    expect(d.projekte[0]).toMatchObject({ nr: 101, hatPlan: true });

    const mitVerkauf = (await http.get(`/api/auswertungen/liquiditaetsplan?projektId=${projektId}&stichtag=2026-10-19&wochen=104&unverkauft=1`)).body;
    expect(zahl(mitVerkauf.summe.ein) + zahl(mitVerkauf.spaeter.ein)).toBeCloseTo(260000 + 20000, 0);
    expect(mitVerkauf.wochen).toHaveLength(104);
  });

  it("verschiebt offene Vorgänge und exportiert Excel", async () => {
    const res = await als(http.post(`/api/projekte/${projektId}/bauzeitenplan/verschieben`)).send({ tage: 14, abNr: 50 });
    expect(res.body.verschoben).toBe(21); // Vorgänge 50 … 250
    const plan = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body;
    expect(plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Rohbau").beginn).toBe("2026-12-07");
    expect(plan.vorgaenge[0].beginn).toBe("2026-08-10"); // Nr. 10 bleibt

    const x = await http.get(`/api/auswertungen/liquiditaetsplan?projektId=${projektId}&stichtag=2026-10-19&format=xlsx`).buffer(true).parse((r, cb) => {
      const teile: Buffer[] = [];
      r.on("data", (c: Buffer) => teile.push(c));
      r.on("end", () => cb(null, Buffer.concat(teile)));
    });
    expect(x.headers["content-type"]).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body as Buffer);
    const ws = wb.worksheets[0]!;
    const texte: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => texte.push(String(c.value))));
    expect(texte).toContain("KW 43/2026");
  });

  it("legt mit der Vorlage Abhängigkeiten an und markiert den kritischen Pfad", async () => {
    const plan = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body;
    const nach = (name: string) => plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === name);
    expect(nach("Rohbau").vorgaenger).toEqual([{ id: nach("Erdarbeiten, Baugrube").id, nr: 50, abstandTage: 2 }]);
    expect(nach("Innenputz").vorgaenger.map((v: { nr: number }) => v.nr).sort()).toEqual([110, 120, 130, 140]);
    expect(nach("Restarbeiten, Abnahme Gemeinschaftseigentum").kritisch).toBe(true);
    expect(nach("Finanzierung, Versicherung, Vertrieb").kritisch).toBe(false);
  });

  it("schiebt bei Verzug alle Nachfolger mit und protokolliert das", async () => {
    const plan = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body;
    const roh = plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Rohbau");
    const zimmerVorher = plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Zimmerarbeiten");
    const ende = new Date(Date.parse(roh.ende) + 21 * 86_400_000).toISOString().slice(0, 10); // 3 Wochen Verzug
    const res = await als(http.put(`/api/vorgaenge/${roh.id}`)).send({ bezeichnung: "Rohbau", beginn: roh.beginn, ende, gewerkIds: roh.gewerkIds, vorgaengerIds: roh.vorgaenger.map((v: { id: string }) => v.id) });
    expect(res.status).toBe(200);
    const tage = Object.fromEntries(res.body.nachfolgerVerschoben.map((v: { bezeichnung: string; tage: number }) => [v.bezeichnung, v.tage]));
    // Direkte Kette rückt voll nach, Puffer werden aufgebraucht: Fenster hatte 2 Wochen, Fliesen 1 Woche Luft
    expect(tage).toMatchObject({ Zimmerarbeiten: 21, "Dachdecker und Flaschner": 21, Estrich: 21, "Fenster, Rollläden, Garagentor": 7, "Fliesen, Treppen, Balkone": 14 });
    // Maler, Außenanlage und Restarbeiten haben genug Puffer; Begleitvorgänge und Gerüst bleiben ohnehin stehen
    for (const fest of ["Maler, Schlosser", "Restarbeiten, Abnahme Gemeinschaftseigentum", "Finanzierung, Versicherung, Vertrieb", "Gerüst"]) expect(tage[fest]).toBeUndefined();
    const nachher = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Zimmerarbeiten");
    expect(Date.parse(nachher.beginn) - Date.parse(zimmerVorher.beginn)).toBe(21 * 86_400_000);
    const protokoll = (await http.get(`/api/protokoll/${nachher.id}`)).body;
    expect(JSON.stringify(protokoll[0].neu)).toContain("Vorgänger verschoben");
  });

  it("weist Zirkelbezüge ab und entfernt Verweise beim Löschen", async () => {
    const plan = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body;
    const erd = plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Erdarbeiten, Baugrube");
    const rest = plan.vorgaenge.find((v: { bezeichnung: string }) => v.bezeichnung === "Restarbeiten, Abnahme Gemeinschaftseigentum");
    const zirkel = await als(http.put(`/api/vorgaenge/${erd.id}`)).send({ bezeichnung: erd.bezeichnung, beginn: erd.beginn, ende: erd.ende, mabvAbschnitt: "erdarbeiten", vorgaengerIds: [...erd.vorgaenger.map((v: { id: string }) => v.id), rest.id] });
    expect(zirkel.status).toBe(400);
    expect(zirkel.body.message).toMatch(/^Zirkelbezug – „Erdarbeiten, Baugrube“ würde auf sich selbst warten: „Erdarbeiten, Baugrube“ wartet auf „Restarbeiten, Abnahme Gemeinschaftseigentum“ wartet auf .* wartet auf „Erdarbeiten, Baugrube“\.$/);
    expect((await als(http.put(`/api/vorgaenge/${erd.id}`)).send({ bezeichnung: erd.bezeichnung, beginn: erd.beginn, ende: erd.ende, vorgaengerIds: [erd.id] })).status).toBe(400);
    const neu = (await als(http.post(`/api/projekte/${projektId}/vorgaenge`)).send({ bezeichnung: "Zwischenschritt", beginn: rest.beginn, ende: rest.ende, vorgaengerIds: [erd.id] })).body;
    await als(http.put(`/api/vorgaenge/${rest.id}`)).send({ bezeichnung: rest.bezeichnung, beginn: rest.beginn, ende: rest.ende, mabvAbschnitt: "fertigstellung", vorgaengerIds: [...rest.vorgaenger.map((v: { id: string }) => v.id), neu.id] });
    expect((await als(http.delete(`/api/vorgaenge/${neu.id}`))).status).toBe(200);
    const restNachher = (await http.get(`/api/projekte/${projektId}/bauzeitenplan`)).body.vorgaenge.find((v: { id: string }) => v.id === rest.id);
    expect(restNachher.vorgaenger.map((v: { id: string }) => v.id)).not.toContain(neu.id);
    expect(restNachher.vorgaenger).toHaveLength(1);
  });

  it("berücksichtigt Nachlass, Skonto, Einbehalte und Bürgschaften", async () => {
    const gewerk = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 410, bezeichnung: "Fenster", geschaetztBrutto: "50000" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70002, suchcode: "fenster", firma: "Fenster GmbH", rollen: ["handwerker"] })).body.id;
    const v = (
      await als(http.post("/api/handwerkervertraege")).send({
        gewerkId: gewerk,
        handwerkerId: hw,
        vertragBrutto: "50000",
        nachlassProzent: "2",
        skontoProzent: "3",
        skontoFristTage: 10,
        einbehaltVertragserfuellungProzent: "10",
        einbehaltGewaehrleistungProzent: "5",
        abnahmeAm: "2027-04-01",
      })
    ).body.id;
    const url = `/api/auswertungen/liquiditaetsplan?projektId=${projektId}&stichtag=2026-10-19&wochen=104`;
    const artSumme = (d: { wochen: { aus: Record<string, string> }[] }, art: string) => d.wochen.reduce((s, w) => s + zahl(w.aus[art] ?? "0"), 0);

    const mit = (await http.get(url)).body;
    expect(mit.skonto).toBe(true);
    // Schlusszahlung 30 Tage nach Abnahme: 49.000 × (10 % − 5 %) × 97 %
    expect(mit.wochen.find((w: { von: string }) => w.von === "2027-04-26").aus.schlusszahlung).toBe("2376.50");
    // Gewährleistungseinbehalt 49.000 × 5 % erst nach fünf Jahren → außerhalb des Planungszeitraums
    expect(artSumme(mit, "gewaehrleistung")).toBe(0);
    expect(mit.einbehalte).toMatchObject({ gewaehrleistung: "2450.00", einbehaltenBisher: "0.00" });
    // Abschläge ohne Vorgang: 49.000 × 90 % × 97 % = 42.777 (über die Bauzeit verteilt, plus Kunst am Bau 10.000)
    expect(artSumme(mit, "ohnePlan") + zahl(mit.ohneTermin.aus)).toBeCloseTo(42777 + 10000, 2);
    expect(zahl(mit.einbehalte.skontoErsparnis)).toBeCloseTo((44100 + 2450) * 0.03, 2);

    const ohne = (await http.get(`${url}&skonto=0`)).body;
    expect(ohne.skonto).toBe(false);
    expect(zahl(ohne.summe.aus) - zahl(mit.summe.aus)).toBeCloseTo((44100 + 2450) * 0.03, 2);

    // Gewährleistungsbürgschaft ersetzt den Einbehalt → volle Freigabe mit der Schlusszahlung
    await als(http.post("/api/buergschaften")).send({ richtung: "erhalten", art: "gewaehrleistung", handwerkervertragId: v, betrag: "2450" });
    const mitBuergschaft = (await http.get(url)).body;
    expect(mitBuergschaft.wochen.find((w: { von: string }) => w.von === "2027-04-26").aus.schlusszahlung).toBe("4753.00");
    expect(mitBuergschaft.einbehalte.gewaehrleistung).toBe("0.00");
  });
});
