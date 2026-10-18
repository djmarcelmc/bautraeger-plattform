/** Integrationstests Zahlungslauf (SEPA) und Bürgschaften (nur mit TEST_DATABASE_URL, Datenbank wird geleert). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const tagePlus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)("Zahlungslauf und Bürgschaften (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const als = (r: request.Test) => r.set("x-benutzer", "buchhaltung@example.com");
  let r1: string;
  let r2: string;
  let r3: string;
  let v1: string;
  let kaufvertrag: string;
  let bank: string;
  let laufId: string;

  /** Vertrag + freigegebene Rechnung über 10.000 € (geprüft 10.000, 2 % Skonto in 14 Tagen). */
  async function rechnung(projektId: string, gewerkNr: number, handwerkerId: string, nr: string, abnahme?: { abnahmeAm: string; gewaehrleistungMonate: number }) {
    const gw = (await als(http.post(`/api/projekte/${projektId}/gewerke`)).send({ nr: gewerkNr, bezeichnung: `Gewerk ${gewerkNr}` })).body.id;
    const v = (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId, vertragBrutto: "50000", skontoProzent: "2", skontoFristTage: "14", zahlungsfristTage: "30", ...abnahme })).body.id;
    const r = (await als(http.post("/api/eingangsrechnungen")).send({ handwerkervertragId: v, rechnungsnr: nr, rechnungsdatum: tagePlus(0), eingangAm: tagePlus(0), betragBrutto: "10000" })).body.id;
    await als(http.post(`/api/eingangsrechnungen/${r}/pruefen`)).send({ geprueftKumuliert: "10000" });
    await als(http.post(`/api/eingangsrechnungen/${r}/freigeben`));
    return { v, r };
  }

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

    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Müller & Söhne Wohnbau GmbH", iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX" })).body.id;
    const g2 = (await als(http.post("/api/gesellschaften")).send({ nr: 2, name: "Zweite GmbH" })).body.id;
    const p = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "lindenweg" })).body.id;
    const p2 = (await als(http.post("/api/projekte")).send({ gesellschaftId: g2, nr: 201, suchcode: "andere" })).body.id;
    const mitFreistellung = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau Größer KG", rollen: ["handwerker"], iban: "DE02120300000000202051", freistellungGueltigBis: tagePlus(365) })).body.id;
    const ohneIban = (await als(http.post("/api/partner")).send({ nr: 70002, suchcode: "fliesen", firma: "Fliesen Ohnekonto", rollen: ["handwerker"] })).body.id;
    const ohneFreistellung = (await als(http.post("/api/partner")).send({ nr: 70003, suchcode: "maler", firma: "Maler Bunt", rollen: ["handwerker"], iban: "DE02500105170137075030", bic: "INGDDEFFXXX" })).body.id;
    bank = (await als(http.post("/api/partner")).send({ nr: 90001, suchcode: "bank", firma: "Bürgschaftsbank AG", rollen: ["bank"] })).body.id;
    ({ v: v1, r: r1 } = await rechnung(p, 300, mitFreistellung, "AR-1", { abnahmeAm: "2020-01-15", gewaehrleistungMonate: 60 }));
    ({ r: r2 } = await rechnung(p, 337, ohneFreistellung, "M-7"));
    ({ r: r3 } = await rechnung(p, 355, ohneIban, "F-1"));
    await rechnung(p2, 300, mitFreistellung, "AR-X");

    const we = (await als(http.post(`/api/projekte/${p}/einheiten`)).send({ nr: "01", typ: "wohnung", vkBrutto: "300000" })).body.id;
    const k = (await als(http.post("/api/partner")).send({ nr: 10001, suchcode: "muster", nachname: "Muster", rollen: ["kunde"] })).body.id;
    kaufvertrag = (await als(http.post("/api/kaufvertraege")).send({ projektId: p, zahlungsanforderungAn: k, kaeufer: [{ partnerId: k }], einheiten: [{ einheitId: we, vkBrutto: "300000" }] })).body.id;
  });

  afterAll(async () => app?.close());

  it("schlägt freigegebene Rechnungen je Gesellschaft mit Zahlbetrag und Hinweisen vor", async () => {
    const d = (await http.get(`/api/zahlungslaeufe/vorschlag?ausfuehrungAm=${tagePlus(1)}`)).body;
    expect(d.gesellschaften).toHaveLength(2);
    const g = d.gesellschaften[0];
    expect(g.gesellschaft).toMatchObject({ nr: 1, kontoOk: true });
    const nach = (nr: string) => g.rechnungen.find((x: { rechnungsnr: string }) => x.rechnungsnr === nr);
    expect(nach("AR-1")).toMatchObject({ auszahlung: "9800.00", skonto: "200.00", bauabzugsteuer: "0.00", skontoMoeglich: true, zahlbar: true });
    expect(nach("M-7")).toMatchObject({ auszahlung: "8330.00", bauabzugsteuer: "1470.00", zahlbar: true });
    expect(nach("M-7").hinweise.join()).toMatch(/Bauabzugsteuer/);
    expect(nach("F-1")).toMatchObject({ zahlbar: false });
    expect(d.gesellschaften[1].gesellschaft.kontoOk).toBe(false);
  });

  it("prüft den Zahlungslauf (Datum, Gesellschaft, Konten)", async () => {
    const vergangen = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [r1], ausfuehrungAm: "2020-01-01" });
    expect(vergangen.body.message).toMatch(/Vergangenheit/);
    const ohne = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [r1, r3], ausfuehrungAm: tagePlus(1) });
    expect(ohne.body.message).toMatch(/Keine gültige IBAN: Fliesen Ohnekonto/);
    const leer = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [], ausfuehrungAm: tagePlus(1) });
    expect(leer.status).toBe(400);
  });

  it("legt den Zahlungslauf an, verbucht die Zahlungen und liefert pain.001", async () => {
    const res = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [r1, r2], ausfuehrungAm: tagePlus(1) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nr: `SL-${tagePlus(1).slice(0, 4)}-00001`, anzahl: 2, summe: "18130.00" });
    laufId = res.body.id;
    expect((await http.get(`/api/eingangsrechnungen/${r1}`)).body.status).toBe("bezahlt");
    const nochmal = await als(http.post("/api/zahlungslaeufe")).send({ rechnungIds: [r1], ausfuehrungAm: tagePlus(1) });
    expect(nochmal.status).toBe(409);

    const d = (await http.get(`/api/zahlungslaeufe/${laufId}`)).body;
    expect(d.zahlungen).toHaveLength(2);
    expect(d.bauabzugsteuer.summe).toBe("1470.00");
    expect(d.bauabzugsteuer.faelligAm).toMatch(/-1[012]$/);
    expect(d.skonto).toBe("400.00");
    expect(d.xml).toBeUndefined();

    const x = await http.get(`/api/zahlungslaeufe/${laufId}/xml`).buffer(true).parse((r, cb) => {
      let t = "";
      r.on("data", (c: Buffer) => (t += c.toString("utf8")));
      r.on("end", () => cb(null, t));
    });
    expect(x.headers["content-disposition"]).toMatch(/SEPA-SL-/);
    const xml = x.body as string;
    expect(xml).toContain("pain.001.001.09");
    expect(xml.match(/<CtrlSum>18130.00<\/CtrlSum>/g)).toHaveLength(2);
    expect(xml).toContain("<Nm>Mueller + Soehne Wohnbau GmbH</Nm>");
    expect(xml).toContain("<Nm>Rohbau Groesser KG</Nm>");
    expect(xml).toContain("abzgl. Bauabzugsteuer 1470,00");
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect((await http.get("/api/zahlungslaeufe")).body[0]).toMatchObject({ id: laufId, anzahl: 2 });
  });

  it("verwaltet Bürgschaften mit Status und Rückgabefälligkeit", async () => {
    expect((await als(http.post("/api/buergschaften")).send({ richtung: "erhalten", art: "gewaehrleistung", betrag: "2500" })).status).toBe(400);
    const gw = await als(http.post("/api/buergschaften")).send({ richtung: "erhalten", art: "gewaehrleistung", handwerkervertragId: v1, buergeId: bank, nr: "GB-123", betrag: "2.500,00", gueltigBis: "" });
    expect(gw.status).toBe(201);
    await als(http.post("/api/buergschaften")).send({ richtung: "erhalten", art: "vertragserfuellung", handwerkervertragId: v1, betrag: "5000", gueltigBis: tagePlus(30) });
    const m7 = await als(http.post("/api/buergschaften")).send({ richtung: "ausgegeben", art: "mabv7", kaufvertragId: kaufvertrag, buergeId: bank, betrag: "300000", gueltigBis: tagePlus(800) });
    expect(m7.status).toBe(201);

    const d = (await http.get("/api/buergschaften")).body;
    expect(d.buergschaften).toHaveLength(3);
    const gwz = d.buergschaften.find((x: { nr: string }) => x.nr === "GB-123");
    expect(gwz).toMatchObject({ status: "rueckgabe_faellig", rueckgabeFaelligAb: "2025-01-15", buerge: "Bürgschaftsbank AG", projekt: { nr: 101 } });
    expect(gwz.bezug).toMatch(/^300 Gewerk 300 – Rohbau Größer KG/);
    expect(d.buergschaften.find((x: { art: string }) => x.art === "mabv7")).toMatchObject({ status: "aktiv", bezug: expect.stringMatching(/^Kaufvertrag/), artText: "Bürgschaft nach § 7 MaBV" });
    expect(d.summen).toMatchObject({ erhalten: "7500.00", ausgegeben: "300000.00", handlungsbedarf: 2 });

    // Rückgabe erfassen
    await als(http.put(`/api/buergschaften/${gw.body.id}`)).send({ richtung: "erhalten", art: "gewaehrleistung", handwerkervertragId: v1, buergeId: bank, nr: "GB-123", betrag: "2500", rueckgabeAm: tagePlus(0) });
    const nachher = (await http.get(`/api/buergschaften?status=handlung`)).body;
    expect(nachher.buergschaften).toHaveLength(1);
    expect((await http.get(`/api/buergschaften?kaufvertragId=${kaufvertrag}`)).body.buergschaften).toHaveLength(1);
    expect((await http.get(`/api/protokoll/${gw.body.id}`)).body.length).toBe(2);
  });
});
