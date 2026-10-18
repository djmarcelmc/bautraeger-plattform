/** Integrationstests Rechnungseingang (nur mit TEST_DATABASE_URL; die Datenbank wird geleert!). */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { migrieren, verbinden } from "@bt/db";
import { sql } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POSTFACH, type Postfach, type PostfachMail } from "./rechnungseingang/postfach.js";

const url = process.env.TEST_DATABASE_URL;
const heute = new Date().toISOString().slice(0, 10);

async function pdf(zeilen: string[], anhang?: { name: string; xml: string }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const seite = doc.addPage([595, 842]);
  zeilen.forEach((z, i) => seite.drawText(z, { x: 50, y: 790 - i * 18, size: 11, font }));
  if (anhang) await doc.attach(Buffer.from(anhang.xml), anhang.name, { mimeType: "text/xml", description: "Rechnungsdaten" });
  return Buffer.from(await doc.save());
}

const cii = (nr: string, betrag: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocument><ram:ID>${nr}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${heute.replace(/-/g, "")}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>BV 102</ram:BuyerReference><ram:SellerTradeParty><ram:Name>Elektro Sommer GmbH</ram:Name></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeSettlement><ram:SpecifiedTradeSettlementPaymentMeans><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE44500105175407324931</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:GrandTotalAmount>${betrag}</ram:GrandTotalAmount><ram:DuePayableAmount>${betrag}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;

class FakePostfach implements Postfach {
  readonly adresse = "rechnungen@muster.de";
  mails: PostfachMail[] = [];
  verarbeitet: string[] = [];
  async neueMails() {
    return this.mails.filter((m) => !this.verarbeitet.includes(m.id));
  }
  async alsVerarbeitetMarkieren(id: string) {
    this.verarbeitet.push(id);
  }
}

describe.skipIf(!url)("Rechnungseingang (Integration)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const postfach = new FakePostfach();
  const als = (r: request.Test) => r.set("x-benutzer", "bauleitung@example.com");
  const ids: Record<string, string> = {};
  const liste = async (status = "neu") => (await http.get(`/api/rechnungseingang?status=${status}`)).body;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await migrieren(url);
    await verbinden(url).execute(sql`truncate mandant cascade; truncate aenderungsprotokoll`);
    const { AppModule } = await import("./app.module.js");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(POSTFACH).useValue(postfach).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    http = request(app.getHttpServer());
    const g = (await als(http.post("/api/gesellschaften")).send({ nr: 1, name: "Muster Wohnbau GmbH" })).body.id;
    const p1 = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 101, suchcode: "LINDENWEG", ort: "Stuttgart" })).body.id;
    const p2 = (await als(http.post("/api/projekte")).send({ gesellschaftId: g, nr: 102, suchcode: "PARKSTRASSE", ort: "Esslingen" })).body.id;
    const rohbau = (await als(http.post("/api/partner")).send({ nr: 70001, suchcode: "rohbau", firma: "Rohbau Muster KG", rollen: ["handwerker"], iban: "DE02120300000000202051", freistellungGueltigBis: "2099-12-31" })).body.id;
    const elektro = (await als(http.post("/api/partner")).send({ nr: 70002, suchcode: "elektro", firma: "Elektro Sommer GmbH", email: "info@elektro-sommer.de", rollen: ["handwerker"], iban: "DE44500105175407324931" })).body.id;
    const vertrag = async (projekt: string, nr: number, hw: string) => {
      const gw = (await als(http.post(`/api/projekte/${projekt}/gewerke`)).send({ nr, bezeichnung: `Gewerk ${nr}` })).body.id;
      return (await als(http.post("/api/handwerkervertraege")).send({ gewerkId: gw, handwerkerId: hw, vertragBrutto: "100000" })).body.id as string;
    };
    ids.rohbau101 = await vertrag(p1, 300, rohbau);
    ids.rohbau102 = await vertrag(p2, 300, rohbau);
    ids.elektro101 = await vertrag(p1, 500, elektro);
    ids.elektro102 = await vertrag(p2, 500, elektro);
  });

  afterAll(async () => app?.close());

  it("liest hochgeladene PDF-Rechnungen, ZUGFeRD und XRechnung und schlägt Handwerker und Vertrag vor", async () => {
    const text = await pdf(["Rohbau Muster KG", "Bauvorhaben: Lindenweg, Stuttgart", "Rechnung Nr. AR-1", `Rechnungsdatum: ${heute.split("-").reverse().join(".")}`, "Gesamtbetrag 34.916,00 EUR", "IBAN DE02 1203 0000 0000 2020 51"]);
    const zugferd = await pdf(["Elektro Sommer GmbH", "Rechnung siehe Anhang"], { name: "factur-x.xml", xml: cii("E-2026-17", "11900.00") });
    const r = await als(http.post("/api/rechnungseingang")).attach("dateien", text, "Rechnung AR-1.pdf").attach("dateien", zugferd, "E-2026-17.pdf").attach("dateien", Buffer.from(cii("E-2026-18", "500.00")), "xrechnung.xml").attach("dateien", Buffer.from("hallo"), "notiz.txt");
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ doppelt: 0, ignoriert: 1 });
    expect(r.body.angelegt).toHaveLength(3);
    expect((await als(http.post("/api/rechnungseingang")).attach("dateien", Buffer.from("x"), "a.txt")).status).toBe(400);

    const l = await liste();
    expect(l.anzahl).toMatchObject({ neu: 3 });
    const nach = (name: string) => l.eingaenge.find((e: { dateiname: string }) => e.dateiname === name);
    const a = nach("Rechnung AR-1.pdf");
    expect(a.daten).toMatchObject({ quelle: "pdf-text", rechnungsnr: "AR-1", rechnungsdatum: heute, betragBrutto: "34916.00", iban: "DE02120300000000202051" });
    expect(a.vorschlag).toMatchObject({ handwerkervertragId: ids.rohbau101, sicherheit: "sicher" });
    const z = nach("E-2026-17.pdf");
    expect(z.daten).toMatchObject({ quelle: "xrechnung-cii", rechnungsnr: "E-2026-17", betragBrutto: "11900.00" });
    expect(z.vorschlag).toMatchObject({ handwerkervertragId: ids.elektro102, sicherheit: "sicher" });
    expect(nach("xrechnung.xml").daten).toMatchObject({ quelle: "xrechnung-cii", rechnungsnr: "E-2026-18" });
    expect(l.vertraege.length).toBe(4);
    expect((await http.get("/api/cockpit")).body.aufgaben.find((x: { link: string }) => x.link === "/rechnungseingang")).toMatchObject({ titel: "3 Rechnungen im Eingang erfassen" });
    ids.a = a.id;
    ids.z = z.id;
    ids.x = nach("xrechnung.xml").id;
  });

  it("erfasst den Eingang als Eingangsrechnung und hängt die Datei an", async () => {
    const werte = { handwerkervertragId: ids.rohbau101, rechnungsnr: "AR-1", rechnungsdatum: heute, eingangAm: heute, betragBrutto: "34916.00" };
    const r = await als(http.post(`/api/rechnungseingang/${ids.a}/erfassen`)).send(werte);
    expect(r.status).toBe(201);
    const rechnung = (await http.get(`/api/eingangsrechnungen/${r.body.eingangsrechnungId}`)).body;
    expect(rechnung).toMatchObject({ rechnungsnr: "AR-1", betragBrutto: "34916.00", status: "erfasst" });
    const dok = (await http.get(`/api/dokumente?objektTyp=eingangsrechnung&objektId=${r.body.eingangsrechnungId}`)).body;
    expect(dok.map((d: { dateiname: string }) => d.dateiname)).toEqual(["Rechnung AR-1.pdf"]);
    expect((await als(http.post(`/api/rechnungseingang/${ids.a}/erfassen`)).send(werte)).status).toBe(409);
    // zweite Rechnung auf denselben Vertrag, solange die erste nicht bezahlt ist → abgewiesen, Eingang bleibt neu
    const x = await als(http.post(`/api/rechnungseingang/${ids.x}/erfassen`)).send({ ...werte, rechnungsnr: "AR-2" });
    expect(x.status).toBe(409);
    expect((await liste()).anzahl).toMatchObject({ neu: 2, erfasst: 1 });
  });

  it("verwirft mit Grund und stellt wieder her", async () => {
    expect((await als(http.post(`/api/rechnungseingang/${ids.x}/verwerfen`)).send({})).status).toBe(400);
    expect((await als(http.post(`/api/rechnungseingang/${ids.x}/verwerfen`)).send({ bemerkung: "Duplikat" })).body.status).toBe("verworfen");
    expect((await liste("verworfen")).eingaenge[0]).toMatchObject({ bemerkung: "Duplikat" });
    expect((await als(http.post(`/api/rechnungseingang/${ids.x}/wiederherstellen`))).body.status).toBe("neu");
  });

  it("holt Rechnungen aus dem Postfach, ohne doppelt aufzunehmen", async () => {
    postfach.mails = [
      { id: "m1", internetMessageId: "<1@elektro>", betreff: "Rechnung E-2026-19", absender: "info@elektro-sommer.de", empfangenAm: new Date().toISOString(), anhaenge: [{ name: "E-2026-19.pdf", typ: "application/pdf", inhalt: await pdf(["Elektro Sommer GmbH", "Rechnungsnummer: E-2026-19", "Rechnungsbetrag 2.380,00 EUR"]) }] },
      { id: "m2", internetMessageId: "<2@newsletter>", betreff: "Newsletter", absender: "news@shop.de", empfangenAm: new Date().toISOString(), anhaenge: [{ name: "logo.png", typ: "image/png", inhalt: Buffer.from("png") }] },
    ];
    const r = await als(http.post("/api/rechnungseingang/abrufen"));
    expect(r.body).toMatchObject({ mails: 2, neu: 1, ohneBeleg: 1 });
    expect(postfach.verarbeitet).toEqual(["m1", "m2"]);
    postfach.verarbeitet = [];
    expect((await als(http.post("/api/rechnungseingang/abrufen"))).body).toMatchObject({ neu: 0 });
    const m = (await liste()).eingaenge.find((e: { betreff: string }) => e.betreff === "Rechnung E-2026-19");
    expect(m).toMatchObject({ quelle: "mail", absender: "info@elektro-sommer.de", daten: { rechnungsnr: "E-2026-19", betragBrutto: "2380.00" } });
    // Absender bekannt, aber zwei offene Verträge → Vertrag wählen
    expect(m.vorschlag).toMatchObject({ handwerkervertragId: null });
  });
});
