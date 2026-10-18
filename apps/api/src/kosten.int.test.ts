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
    expect(z.body.message).toMatch(/Kein Zahlbetrag offen/);
  });
});
