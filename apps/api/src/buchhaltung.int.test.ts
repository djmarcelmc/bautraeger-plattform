/** Integrationstests Buchungsjournal und DATEV-Export (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const heute = new Date().toISOString().slice(0, 10);
const jahr = heute.slice(0, 4);

describe.skipIf(!url)("Buchungsjournal (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "buchhaltung@example.com");
  const ids: Record<string, string> = {};
  const journal = async (q = "") => (await als(http.get(`/api/buchhaltung/journal?gesellschaftId=${ids.g}${q}`))).body;
  const kurz = (z: { quelleTyp: string; konto: string; gegenkonto: string; betrag: string; sollHaben: string }) => [z.quelleTyp, z.konto, z.gegenkonto, z.betrag, z.sollHaben];
  const exportieren = (nurNeue = true) =>
    als(http.post("/api/buchhaltung/export"))
      .send({ gesellschaftId: ids.g, von: `${jahr}-01-01`, bis: `${jahr}-12-31`, nurNeue })
      .buffer(true)
      .parse((res, cb) => {
        const teile: Buffer[] = [];
        res.on("data", (c: Buffer) => teile.push(c));
        res.on("end", () => cb(null, Buffer.concat(teile)));
      });

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
    ids.p = (await als(http.post("/api/projekte")).send({ gesellschaftId: ids.g, nr: 101, suchcode: "LINDENWEG" })).body.id;
    const we = (await als(http.post(`/api/projekte/${ids.p}/einheiten`)).send({ nr: "W01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 17, suchcode: "mueller", nachname: "Müller", rollen: ["kunde"] })).body.id;
    ids.v = (await als(http.post("/api/kaufvertraege")).send({ projektId: ids.p, datum: `${jahr}-01-15`, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k, anteilProzent: "100" }], einheiten: [{ einheitId: we, vkBrutto: "300000" }] })).body.id;
    await als(http.put(`/api/kaufvertraege/${ids.v}/konditionen`)).send({ zahlungsanforderungAn: k, vertragWirksam: true, vormerkungEingetragenAm: `${jahr}-01-20`, lastenfreistellungGesichert: true, zahlungszielTage: 10 });
    await als(http.post(`/api/projekte/${ids.p}/bautenstand`)).send({ einheitIds: [we], abschnitt: "erdarbeiten", fertigAm: `${jahr}-01-25` });
    const v = (await http.get(`/api/kaufvertraege/${ids.v}`)).body;
    const za = await als(http.post("/api/zahlungsanforderungen")).send({ rateIds: [v.raten[0].id], datum: heute });
    expect(za.status).toBe(201);
    ids.za = za.body.id;
    expect((await als(http.post("/api/zahlungseingaenge")).send({ zahlungsanforderungId: ids.za, datum: heute, betrag: "30000" })).status).toBe(201);

    const hw = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau KG", rollen: ["handwerker"] })).body.id;
    const gw = (await als(http.post(`/api/projekte/${ids.p}/gewerke`)).send({ nr: 300, bezeichnung: "Rohbau" })).body.id;
    const hv = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "50000" })).body.id;
    ids.r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: hv, rechnungsnr: "R 300/1", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "10000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${ids.r}/pruefen`)).send({ geprueftKumuliert: "10000" });
    await als(http.post(`/api/eingangsrechnungen/${ids.r}/freigeben`));
    // eine erfasste, nicht freigegebene Rechnung wird nicht gebucht
    await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: hv, rechnungsnr: "R 300/2", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "5000" });
  });

  afterAll(async () => app?.close());

  it("bucht Anforderung, Zahlungseingang und freigegebene Rechnung automatisch", async () => {
    const j = await journal();
    expect(j.abgleich).toMatchObject({ neu: 3, geaendert: 0, geloescht: 0, storniert: 0 });
    expect(j.zeilen.map(kurz)).toEqual(
      expect.arrayContaining([
        ["zahlungsanforderung", "10017", "1710", "90000.00", "S"],
        ["zahlungseingang", "1200", "10017", "30000.00", "S"],
        ["eingangsrechnung", "3100", "70001", "10000.00", "S"],
      ]),
    );
    expect(j.zeilen.find((z: { quelleTyp: string }) => z.quelleTyp === "eingangsrechnung")).toMatchObject({ belegnr: "R300/1", kostenstelle: "101", verweis: `/eingangsrechnungen/${ids.r}` });
    expect(j.summen).toMatchObject({ anzahl: 3, neu: 3, summeNeu: "130000.00" });
    // zweiter Aufruf bucht nichts doppelt
    expect((await journal()).abgleich).toMatchObject({ neu: 0, geaendert: 0 });
    expect((await journal("&quelle=zahlungseingang")).zeilen).toHaveLength(1);
  });

  it("bucht die Zahlung mit einbehaltener Bauabzugsteuer", async () => {
    expect((await als(http.post(`/api/eingangsrechnungen/${ids.r}/zahlung`)).send({ datum: heute })).status).toBe(201);
    const j = await journal();
    expect(j.abgleich.neu).toBe(2);
    expect(j.zeilen.filter((z: { quelleTyp: string }) => z.quelleTyp.startsWith("zahlungsausgang")).map(kurz)).toEqual([
      ["zahlungsausgang", "70001", "1200", "8500.00", "S"],
      ["zahlungsausgang.bauabzug", "70001", "1736", "1500.00", "S"],
    ]);
  });

  it("exportiert nur mit DATEV-Daten, schreibt fest und exportiert danach nur Neues", async () => {
    expect((await exportieren()).status).toBe(409);
    await als(http.put(`/api/gesellschaften/${ids.g}`)).send({ nr: 1, name: "Muster Wohnbau GmbH", datevBeraternr: 1234567, datevMandantennr: 42 });
    // Rechnungsscan an der Eingangsrechnung → Beleg für Rechnung und Zahlung
    await als(http.post("/api/dokumente")).field("objektTyp", "eingangsrechnung").field("objektId", ids.r).attach("datei", Buffer.from("%PDF-1.4 scan"), "Rechnung R 300-1.pdf");
    const r = await exportieren();
    expect(r.status).toBe(201);
    expect(r.headers["content-disposition"]).toMatch(/EXTF-\d{14}_1_/);
    const stapel = r.headers["x-export-stapel"];
    expect(stapel).toMatch(/^EXTF-\d{14}$/);
    const belege = (await http.get(`/api/buchhaltung/belege?gesellschaftId=${ids.g}&stapel=${stapel}`)).body;
    expect(belege).toEqual([
      expect.objectContaining({ art: "Zahlungsanforderung", id: ids.za, belegnr: expect.stringMatching(/^ZA-/), dokumente: [], pfad: `/zahlungsanforderungen/${ids.za}` }),
      expect.objectContaining({ art: "Eingangsrechnung", id: ids.r, belegnr: "R300/1", pfad: null, dokumente: [expect.objectContaining({ dateiname: "Rechnung R 300-1.pdf" })] }),
    ]);
    const liste = (await http.get(`/api/buchhaltung/stapel?gesellschaftId=${ids.g}`)).body;
    expect(liste[0]).toMatchObject({ stapel, anzahl: 5 });
    const kopie = await http.get(`/api/buchhaltung/stapel/${stapel}?gesellschaftId=${ids.g}`).buffer(true).parse((res, cb) => {
      const t: Buffer[] = [];
      res.on("data", (c: Buffer) => t.push(c));
      res.on("end", () => cb(null, Buffer.concat(t)));
    });
    expect((kopie.body as Buffer).toString("latin1").split("\r\n").filter((z) => /^\d/.test(z))).toHaveLength(5);
    const text = (r.body as Buffer).toString("latin1").split("\r\n");
    expect(text[0]).toMatch(/^"EXTF";700;21;"Buchungsstapel"/);
    expect(text.filter((z) => /^\d/.test(z))).toHaveLength(5);
    expect(text.some((z) => z.startsWith('90000,00;"S";"EUR";;;;10017;1710;'))).toBe(true);
    const j = await journal("&status=neu");
    expect(j.zeilen).toHaveLength(0);
    expect((await exportieren()).status).toBe(409);
    expect((await exportieren(false)).status).toBe(201);
  });

  it("storniert exportierte Buchungen, wenn sich die Kontierung ändert", async () => {
    const std = (await http.get(`/api/buchhaltung/kontierung/${ids.g}`)).body;
    expect(std).toMatchObject({ gespeichert: false, kontierung: { bank: "1200", debitorBasis: 10000 } });
    expect((await als(http.put(`/api/buchhaltung/kontierung/${ids.g}`)).send({ ...std.kontierung, bank: "12x" })).status).toBe(400);
    expect((await als(http.put(`/api/buchhaltung/kontierung/${ids.g}`)).send({ ...std.kontierung, bank: "1210" })).body.gespeichert).toBe(true);
    const j = await journal();
    // Zahlungseingang und Zahlungsausgang laufen über die Bank → je Storno + Neubuchung
    expect(j.abgleich).toMatchObject({ neu: 2, storniert: 2 });
    const stornos = j.zeilen.filter((z: { stornoVon: string | null }) => z.stornoVon);
    expect(stornos.map(kurz)).toEqual(
      expect.arrayContaining([
        ["zahlungseingang", "1200", "10017", "30000.00", "H"],
        ["zahlungsausgang", "70001", "1200", "8500.00", "H"],
      ]),
    );
    expect(j.zeilen.filter((z: { storniert: boolean }) => z.storniert)).toHaveLength(2);
    expect(j.zeilen.filter((z: { exportiertAm: string | null }) => !z.exportiertAm).map(kurz)).toEqual(
      expect.arrayContaining([
        ["zahlungseingang", "1210", "10017", "30000.00", "S"],
        ["zahlungsausgang", "70001", "1210", "8500.00", "S"],
      ]),
    );
    // Zurücksetzen vor dem nächsten Export: die neuen (nicht exportierten) Buchungen werden angepasst, nicht storniert
    await als(http.delete(`/api/buchhaltung/kontierung/${ids.g}`));
    const nachher = await journal();
    expect(nachher.abgleich).toMatchObject({ neu: 0, storniert: 0, geaendert: 2 });
  });

  it("bucht mit der Übergabe die Anzahlungen auf Erlöse um", async () => {
    await verbinden(url!).execute(sql`update kaufvertrag set uebergabe_ist = now() where id = ${ids.v}`);
    const j = await journal("&quelle=uebergabe");
    expect(j.abgleich.neu).toBe(1);
    expect(j.zeilen.map(kurz)).toEqual([["uebergabe", "1710", "8100", "90000.00", "S"]]);
    expect(j.zeilen[0]).toMatchObject({ belegdatum: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }), verweis: `/kaufvertraege/${ids.v}` });
  });

  it("verwendet das eigene Personenkonto des Geschäftspartners", async () => {
    const liste = (await http.get("/api/partner")).body as { id: string; nr: number }[];
    const kaeufer = liste.find((x) => x.nr === 17)!;
    const handwerker = liste.find((x) => x.nr === 70001)!;
    const p = (await http.get(`/api/partner/${kaeufer.id}`)).body;
    const basis = { nr: 17, suchcode: p.suchcode, nachname: p.nachname, rollen: p.rollen };
    expect((await als(http.put(`/api/partner/${kaeufer.id}`)).send({ ...basis, debitorKonto: "12x" })).status).toBe(400);
    expect((await als(http.put(`/api/partner/${kaeufer.id}`)).send({ ...basis, debitorKonto: "12345" })).body.debitorKonto).toBe("12345");
    // gleiches Konto bei einem anderen Partner wird abgewiesen
    const h = (await http.get(`/api/partner/${handwerker.id}`)).body;
    const dop = await als(http.put(`/api/partner/${handwerker.id}`)).send({ nr: 70001, suchcode: h.suchcode, firma: h.firma, rollen: h.rollen, debitorKonto: "12345" });
    expect(dop.status).toBe(409);
    expect(dop.body.message).toMatch(/Debitorenkonto ist bereits/);
    const j = await journal("&quelle=zahlungsanforderung");
    // exportierte Anforderung: Storno auf 10017, Neubuchung auf 12345
    expect(j.zeilen.map(kurz)).toEqual(
      expect.arrayContaining([
        ["zahlungsanforderung", "10017", "1710", "90000.00", "H"],
        ["zahlungsanforderung", "12345", "1710", "90000.00", "S"],
      ]),
    );
  });

  it("Saldenliste: Journal = offene Posten, Abweichung zur DATEV-Saldenliste", async () => {
    const l = (await als(http.get(`/api/buchhaltung/saldenliste?gesellschaftId=${ids.g}`))).body;
    expect(l.zeilen.map((z: { konto: string; journal: string; op: string; differenzOp: string }) => [z.konto, z.journal, z.op, z.differenzOp])).toEqual([["12345", "60000.00", "60000.00", "0.00"]]);
    expect(l.summen.debitor).toMatchObject({ journal: "60000.00", op: "60000.00", abweichungen: 0 });
    const csv = Buffer.from("Konto;Beschriftung;Saldo;S/H\n12345;Müller;59.000,00;S\n70001;Rohbau KG;0,00;H\n", "utf8");
    const v = await als(http.post("/api/buchhaltung/saldenliste")).field("gesellschaftId", ids.g).attach("datei", csv, "SuSa.csv");
    expect(v.status).toBe(201);
    expect(v.body.mitDatev).toBe(true);
    expect(v.body.zeilen[0]).toMatchObject({ konto: "12345", datev: "59000.00", differenzDatev: "1000.00" });
    expect(v.body.summen.debitor.abweichungen).toBe(1);
    expect((await als(http.post("/api/buchhaltung/saldenliste")).field("gesellschaftId", ids.g).attach("datei", Buffer.from("x;y\n1;2"), "a.csv")).body.message).toMatch(/Konto/);
    // Excel – ohne und mit DATEV-Vergleich
    const roh = (r: request.Test) => r.buffer(true).parse((res, cb) => {
      const t: Buffer[] = [];
      res.on("data", (c: Buffer) => t.push(c));
      res.on("end", () => cb(null, Buffer.concat(t)));
    });
    const x1 = await roh(als(http.get(`/api/buchhaltung/saldenliste?gesellschaftId=${ids.g}&format=xlsx`)));
    expect(x1.headers["content-type"]).toMatch(/spreadsheetml/);
    expect((x1.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    const ExcelJS = (await import("exceljs")).default;
    const mappe = new ExcelJS.Workbook();
    const x2 = await roh(als(http.post("/api/buchhaltung/saldenliste")).field("gesellschaftId", ids.g).field("format", "xlsx").attach("datei", csv, "SuSa.csv"));
    await mappe.xlsx.load(x2.body as Buffer);
    const werte = mappe.worksheets[0]!.getSheetValues().flat().map(String).join("|");
    expect(werte).toMatch(/mit DATEV-Vergleich/);
    expect(werte).toMatch(/12345\|Müller\|60000\|S\|60000\|0\|59000\|1000/);
  });

  it("protokolliert Abgleich und Export", async () => {
    const p = (await http.get(`/api/protokoll/${ids.g}`)).body as { neu: Record<string, unknown> }[];
    expect(p.some((e) => e.neu && "export" in e.neu)).toBe(true);
    expect(p.some((e) => e.neu && "abgleich" in e.neu)).toBe(true);
  });
});
