import { describe, expect, it } from "vitest";
import { eRechnungLesen, eingangVorschlag, rechnungsdatenZusammenfuehren, rechnungstextLesen, type HandwerkerKandidat, type VertragKandidat } from "./rechnungseingang.js";

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>AR-2026-0815</ram:ID><ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261015</udt:DateTimeString></ram:IssueDateTime>
    <ram:IncludedNote><ram:Content>3. Abschlagsrechnung</ram:Content></ram:IncludedNote></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>BV 101 Lindenweg</ram:BuyerReference>
      <ram:SellerTradeParty><ram:Name>Rohbau Muster KG</ram:Name>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">93815/08152</ram:ID></ram:SpecifiedTaxRegistration>
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE123456789</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE02 1203 0000 0000 2020 51</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:TaxBasisTotalAmount>29341.18</ram:TaxBasisTotalAmount><ram:GrandTotalAmount currencyID="EUR">34916.00</ram:GrandTotalAmount><ram:DuePayableAmount>34916.00</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const UBL = `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>2026-117</cbc:ID><cbc:IssueDate>2026-10-12</cbc:IssueDate><cbc:Note>Schlussrechnung Elektroinstallation</cbc:Note><cbc:BuyerReference>04011000-12345-67</cbc:BuyerReference>
<cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Elektro Sommer</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>DE987654321</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Elektro Sommer GmbH</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>DE44500105175407324931</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
<cac:LegalMonetaryTotal><cbc:TaxInclusiveAmount currencyID="EUR">11900.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">11900.00</cbc:PayableAmount></cac:LegalMonetaryTotal></Invoice>`;

const TEXT = `Rohbau Muster KG
Industriestraße 4 · 70565 Stuttgart
CUBI VIVIT Immobilien GmbH
Bauvorhaben: Lindenweg 5, Stuttgart (BV 101)
Rechnung Nr. AR-2026-0815
Rechnungsdatum: 15.10.2026
3. Abschlagsrechnung
Zwischensumme netto 29.341,18 €
zzgl. 19 % MwSt. 5.574,82 €
Gesamtbetrag 34.916,00 €
Bitte überweisen Sie auf IBAN DE02 1203 0000 0000 2020 51 · USt-IdNr. DE123456789 · St.-Nr. 93815/08152`;

describe("eRechnungLesen", () => {
  it("liest XRechnung/ZUGFeRD im CII-Format", () => {
    expect(eRechnungLesen(CII)).toEqual({
      quelle: "xrechnung-cii",
      rechnungsnr: "AR-2026-0815",
      rechnungsdatum: "2026-10-15",
      betragBrutto: "34916.00",
      verkaeufer: "Rohbau Muster KG",
      iban: "DE02120300000000202051",
      ustId: "DE123456789",
      steuernummer: "93815/08152",
      referenz: "BV 101 Lindenweg",
      schlussrechnung: false,
    });
  });
  it("liest XRechnung im UBL-Format und erkennt die Schlussrechnung", () => {
    expect(eRechnungLesen(UBL)).toMatchObject({ quelle: "xrechnung-ubl", rechnungsnr: "2026-117", rechnungsdatum: "2026-10-12", betragBrutto: "11900.00", verkaeufer: "Elektro Sommer GmbH", iban: "DE44500105175407324931", ustId: "DE987654321", schlussrechnung: true });
  });
  it("ignoriert andere XML-Dateien", () => {
    expect(eRechnungLesen("<Document><BkToCstmrStmt/></Document>")).toBeNull();
    expect(eRechnungLesen("kein xml <")).toBeNull();
  });
});

describe("rechnungstextLesen", () => {
  it("findet Nummer, Datum, Endbetrag (nicht die Zwischensumme), IBAN und Steuerdaten", () => {
    expect(rechnungstextLesen(TEXT)).toMatchObject({
      quelle: "pdf-text",
      rechnungsnr: "AR-2026-0815",
      rechnungsdatum: "2026-10-15",
      betragBrutto: "34916.00",
      verkaeufer: "Rohbau Muster KG",
      iban: "DE02120300000000202051",
      ustId: "DE123456789",
      steuernummer: "93815/08152",
      schlussrechnung: false,
    });
  });
  it("Schlussrechnung und alternative Schreibweisen", () => {
    const d = rechnungstextLesen("Maler Bunt e.K.\nSchlussrechnung\nRe.-Nr.: 4711\nDatum 3.9.26\nzu zahlender Betrag EUR 1.234,50");
    expect(d).toMatchObject({ rechnungsnr: "4711", rechnungsdatum: "2026-09-03", betragBrutto: "1234.50", schlussrechnung: true });
  });
  it("ergänzt fehlende XML-Felder aus dem Text", () => {
    const xml = { ...eRechnungLesen(CII)!, iban: null };
    expect(rechnungsdatenZusammenfuehren(xml, rechnungstextLesen(TEXT))).toMatchObject({ quelle: "xrechnung-cii", iban: "DE02120300000000202051" });
  });
});

describe("eingangVorschlag", () => {
  const hw: HandwerkerKandidat[] = [
    { id: "h1", name: "Rohbau Muster KG", email: "buchhaltung@rohbau-muster.de", iban: "DE02120300000000202051", steuernummer: null },
    { id: "h2", name: "Elektro Sommer GmbH", email: "info@elektro-sommer.de", iban: null, steuernummer: null },
  ];
  const v = (id: string, handwerkerId: string, projektNr: number, suchcode: string, x: Partial<VertragKandidat> = {}): VertragKandidat => ({ id, handwerkerId, projektNr, projektSuchcode: suchcode, projektOrt: null, gewerk: "Rohbau", abgeschlossen: false, offeneRechnung: false, ...x });

  it("IBAN + Bauvorhaben im Text → sicher", () => {
    const r = eingangVorschlag(rechnungstextLesen(TEXT), TEXT, null, hw, [v("v1", "h1", 101, "LINDENWEG"), v("v2", "h1", 102, "PARKSTRASSE")]);
    expect(r).toMatchObject({ handwerkerId: "h1", handwerkervertragId: "v1", sicherheit: "sicher" });
    expect(r.gruende).toEqual(["IBAN stimmt überein", "Bauvorhaben 101 LINDENWEG im Text"]);
  });
  it("Absender-Domain und einziger offener Vertrag", () => {
    const d = eRechnungLesen(UBL)!;
    const r = eingangVorschlag({ ...d, iban: null }, "", "rechnung@elektro-sommer.de", hw, [v("v3", "h2", 101, "LINDENWEG"), v("v4", "h2", 102, "PARKSTRASSE", { abgeschlossen: true })]);
    expect(r).toMatchObject({ handwerkerId: "h2", handwerkervertragId: "v3", sicherheit: "wahrscheinlich" });
  });
  it("mehrere Verträge ohne Bezug: Handwerker erkannt, Vertrag offen", () => {
    const r = eingangVorschlag({ ...rechnungstextLesen("Rohbau Muster KG\nRechnung 1"), iban: "DE02120300000000202051" }, "Rohbau Muster KG", null, hw, [v("v1", "h1", 101, "LINDENWEG"), v("v2", "h1", 102, "PARKSTRASSE")]);
    expect(r).toMatchObject({ handwerkerId: "h1", handwerkervertragId: null, sicherheit: "moeglich" });
    expect(r.gruende).toContain("2 offene Verträge – bitte wählen");
  });
  it("unbekannter Absender", () => {
    expect(eingangVorschlag(rechnungstextLesen("Fremdfirma\n"), "Fremdfirma", "x@gmail.com", hw, [])).toMatchObject({ handwerkerId: null, sicherheit: null });
  });
});
