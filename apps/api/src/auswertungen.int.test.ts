/** Integrationstests Auswertungen (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Auswertungen (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "gf@example.com");
  let projektId: string;

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

    // Projekt: Wohnung (Liste 300.000, verkauft für 310.000) + Stellplatz (Liste 20.000, frei)
    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    projektId = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
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

    // Kosten: Rohbau geschätzt 200.000, vergeben 180.000, Rechnung 50.000 geprüft und bezahlt (ohne Freistellung → 15 % Bauabzug)
    const gw = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau", geschaetztBrutto: "200000" })).body.id;
    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"] })).body.id;
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "180000" })).body.id;
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: "AR-1", rechnungsdatum: "2026-06-01", eingangAm: "2026-06-01", betragBrutto: "50000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "50000" });
    await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    await als(http.post(`/api/eingangsrechnungen/${r}/zahlung`)).send({ datum: "2026-06-05" });
  });

  afterAll(async () => app?.close());

  it("rechnet die Liquiditätsbetrachtung", async () => {
    const d = (await http.get("/api/auswertungen/liquiditaet")).body;
    const p = d.gesellschaften[0].projekte[0];
    expect(p.erloese).toEqual({ trend: "330000.00", angefordert: "93000.00", bezahlt: "50000.00", offen: "43000.00" });
    expect(p.kosten).toEqual({ trend: "180000.00", angefordert: "50000.00", bezahlt: "50000.00", offen: "0.00" });
    expect(p.saldo).toEqual({ trend: "150000.00", angefordert: "43000.00", bezahlt: "0.00", offen: "43000.00" });
    expect(d.gesamt.saldo.trend).toBe("150000.00");
  });

  it("rechnet die Controlling-Übersicht", async () => {
    const p = (await http.get("/api/auswertungen/controlling")).body.projekte[0];
    expect(p.kosten).toEqual({ standProzent: "27.8", geschaetzt: "200000.00", trend: "180000.00", abweichung: "20000.00" });
    expect(p.verkauf).toEqual({ standProzent: "93.8", geschaetzt: "320000.00", trend: "330000.00", abweichung: "10000.00" });
    expect(p.ertrag).toEqual({ geschaetzt: "120000.00", trend: "150000.00", abweichung: "30000.00" });
  });

  it("erstellt den Projektbericht", async () => {
    const b = (await http.get(`/api/auswertungen/projektbericht/${projektId}`)).body;
    expect(b.verkauf.vertraege[0]).toMatchObject({ nr: "KV-101-001", bezahltProzent: "16.1", kaeufer: ["Muster"] });
    expect(b.verkauf.unverkauft.map((e: { nr: string }) => e.nr)).toEqual(["TG1"]);
    expect(b.verkauf.summen).toMatchObject({ vertragssumme: "310000.00", bezahlt: "50000.00", unverkauftPlan: "20000.00" });
    expect(b.kosten.vergeben).toHaveLength(1);
  });

  it("exportiert Excel mit echten Zahlen", async () => {
    const res = await http.get("/api/auswertungen/controlling?format=xlsx").buffer(true).parse((r, cb) => {
      const teile: Buffer[] = [];
      r.on("data", (c: Buffer) => teile.push(c));
      r.on("end", () => cb(null, Buffer.concat(teile)));
    });
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(res.headers["content-disposition"]).toMatch(/Controlling-\d{4}-\d{2}-\d{2}\.xlsx/);
    const mappe = new ExcelJS.Workbook();
    await mappe.xlsx.load(res.body);
    const blatt = mappe.getWorksheet("Controlling")!;
    const werte = blatt.getSheetValues().flat().filter((v) => typeof v === "number");
    expect(werte).toContain(150000);
    for (const pfad of ["liquiditaet", `kostenreport/${projektId}`, `projektbericht/${projektId}`]) {
      const r = await http.get(`/api/auswertungen/${pfad}?format=xlsx`);
      expect(r.status).toBe(200);
    }
  });
});
