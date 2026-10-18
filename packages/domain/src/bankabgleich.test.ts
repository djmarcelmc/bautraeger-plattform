import { describe, expect, it } from "vitest";
import { camtLesen, kontoauszugLesen, mt940Lesen, umsatzSchluesselListe, zuordnungVorschlag, type Bankumsatz, type OffeneAnforderung } from "./bankabgleich.js";

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-1</MsgId><CreDtTm>2026-10-17T06:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>2026-196</Id>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">116040.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-10-16</Dt></BookgDt><ValDt><Dt>2026-10-16</Dt></ValDt>
        <AcctSvcrRef>2026101600001</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
          <RltdPties><Dbtr><Pty><Nm>Max Mustermann</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct></RltdPties>
          <RmtInf><Ustrd>Rechnung ZA-2026-00001</Ustrd><Ustrd>KV-101-001 Rate 1</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">58928.17</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-10-17</Dt></BookgDt><ValDt><Dt>2026-10-17</Dt></ValDt>
        <AddtlNtryInf>SAMMEL-UEBERWEISUNG SL-2026-00001</AddtlNtryInf>
        <NtryDtls>
          <TxDtls><Refs><EndToEndId>SL-2026-00001-AR-1</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">29086.34</Amt></TxAmt></AmtDtls>
            <RltdPties><Cdtr><Pty><Nm>Rohbau Muster KG</Nm></Pty></Cdtr></RltdPties><RmtInf><Ustrd>Rechnung AR-1</Ustrd></RmtInf></TxDtls>
          <TxDtls><Refs><EndToEndId>SL-2026-00001-AR-2</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">29841.83</Amt></TxAmt></AmtDtls>
            <RltdPties><Cdtr><Pty><Nm>Rohbau Muster KG</Nm></Pty></Cdtr></RltdPties><RmtInf><Ustrd>Rechnung AR-2</Ustrd></RmtInf></TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>PDNG</Cd></Sts><BookgDt><Dt>2026-10-18</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const MT940 = [
  ":20:STARTUMSE",
  ":25:DE02120300000000202051",
  ":28C:00196/001",
  ":60F:C261015EUR1000,00",
  ":61:2610161016CR1930,00NTRFNONREF//2026101600002",
  ":86:166?00SEPA-GUTSCHRIFT?20EREF+NOTPROVIDED?21SVWZ+Rechnung ZA-2026-0000?223 Sonderwunsch?30BYLADEMMXXX?31DE44500105175407324931?32Erika Beispiel",
  ":61:2610191019DR25,50NMSCNONREF",
  ":86:805?00ABSCHLUSS?20Kontofuehrung",
  ":62F:C261019EUR117944,50",
  "-",
].join("\r\n");

describe("camtLesen", () => {
  it("liest Konto, Gutschriften und teilt Sammelbuchungen in Einzelposten", () => {
    const a = camtLesen(CAMT);
    expect(a.kontoIban).toBe("DE02120300000000202051");
    expect(a.umsaetze).toHaveLength(3); // vorgemerkter Umsatz fehlt
    expect(a.umsaetze[0]).toEqual({
      buchungsdatum: "2026-10-16",
      valuta: "2026-10-16",
      betrag: "116040.00",
      waehrung: "EUR",
      name: "Max Mustermann",
      iban: "DE89370400440532013000",
      verwendungszweck: "Rechnung ZA-2026-00001 KV-101-001 Rate 1",
      endToEndId: null,
      bankreferenz: "2026101600001",
    });
    expect(a.umsaetze.slice(1).map((u) => [u.betrag, u.endToEndId, u.name])).toEqual([
      ["-29086.34", "SL-2026-00001-AR-1", "Rohbau Muster KG"],
      ["-29841.83", "SL-2026-00001-AR-2", "Rohbau Muster KG"],
    ]);
  });
  it("lehnt fremde XML-Dateien ab", () => {
    expect(() => camtLesen("<Document><CstmrCdtTrfInitn/></Document>")).toThrow(/Keine CAMT-Datei/);
  });
});

describe("mt940Lesen", () => {
  it("liest Umsätze mit strukturiertem Feld 86 (SEPA-Schlüsselwörter, Folgezeilen)", () => {
    const a = mt940Lesen(MT940);
    expect(a.kontoIban).toBe("DE02120300000000202051");
    expect(a.umsaetze).toHaveLength(2);
    expect(a.umsaetze[0]).toMatchObject({ buchungsdatum: "2026-10-16", betrag: "1930.00", name: "Erika Beispiel", iban: "DE44500105175407324931", verwendungszweck: "Rechnung ZA-2026-00003 Sonderwunsch", endToEndId: null, bankreferenz: "2026101600002" });
    expect(a.umsaetze[1]).toMatchObject({ betrag: "-25.50", verwendungszweck: "Kontofuehrung" });
  });
  it("erkennt das Format am Inhalt", () => {
    expect(kontoauszugLesen(Buffer.from(CAMT)).format).toBe("camt");
    expect(kontoauszugLesen(Buffer.from(MT940, "latin1")).format).toBe("mt940");
    expect(() => kontoauszugLesen("Datum;Betrag")).toThrow(/Unbekanntes Dateiformat/);
  });
});

describe("umsatzSchluesselListe", () => {
  it("unterscheidet gleiche Umsätze einer Datei und bleibt beim erneuten Import gleich", () => {
    const u = camtLesen(CAMT).umsaetze[0]!;
    const k = umsatzSchluesselListe("DE02", [u, u]);
    expect(k[0]).not.toBe(k[1]);
    expect(umsatzSchluesselListe("DE02", [u, u])).toEqual(k);
  });
});

describe("zuordnungVorschlag", () => {
  const a = (id: string, rechnungsnr: string, offen: string, namen = ["Max Mustermann"]): OffeneAnforderung => ({ id, rechnungsnr, kaufvertragNr: "KV-101-001", offen, namen, ibans: [] });
  const u = (betrag: string, verwendungszweck: string, x: Partial<Bankumsatz> = {}): Bankumsatz => ({ buchungsdatum: "2026-10-16", valuta: null, betrag, waehrung: "EUR", name: "Max Mustermann", iban: null, verwendungszweck, endToEndId: null, bankreferenz: null, ...x });
  const leer = { anforderungen: [], zahlungslaeufe: [], zahlungsausgaenge: [] };

  it("Rechnungsnummer im Verwendungszweck: sicher (auch Teilzahlung), Überzahlung nur als Hinweis", () => {
    const offen = { ...leer, anforderungen: [a("1", "ZA-2026-00001", "116040.00"), a("2", "ZA-2026-00002", "500.00")] };
    expect(zuordnungVorschlag(u("116040.00", "Rechnung ZA 2026 00001"), offen)).toMatchObject({ art: "anforderung", sicherheit: "sicher", posten: [{ id: "1", betrag: "116040.00" }] });
    expect(zuordnungVorschlag(u("100000.00", "ZA-2026-00001"), offen)).toMatchObject({ sicherheit: "sicher", grund: expect.stringMatching(/Teilzahlung/) });
    expect(zuordnungVorschlag(u("120000.00", "ZA-2026-00001"), offen)).toMatchObject({ sicherheit: "moeglich", posten: [] });
  });

  it("mehrere Rechnungsnummern mit passender Summe", () => {
    const offen = { ...leer, anforderungen: [a("1", "ZA-2026-00001", "1000"), a("2", "ZA-2026-00002", "500")] };
    const v = zuordnungVorschlag(u("1500.00", "ZA-2026-00001 und ZA-2026-00002"), offen);
    expect(v).toMatchObject({ sicherheit: "sicher", posten: [{ id: "1", betrag: "1000.00" }, { id: "2", betrag: "500.00" }] });
  });

  it("ohne Rechnungsnummer: Kaufvertrag oder Betrag + Name wahrscheinlich, nur Betrag möglich", () => {
    const offen = { ...leer, anforderungen: [a("1", "ZA-2026-00001", "1000"), a("2", "ZA-2026-00009", "2000", ["Erika Beispiel"])] };
    expect(zuordnungVorschlag(u("1000.00", "Kaufpreis KV 101 001"), offen)).toMatchObject({ sicherheit: "wahrscheinlich", posten: [{ id: "1" }] });
    expect(zuordnungVorschlag(u("2000.00", "Rate", { name: "BEISPIEL, ERIKA" }), offen)).toMatchObject({ sicherheit: "wahrscheinlich", posten: [{ id: "2" }] });
    expect(zuordnungVorschlag(u("2000.00", "Rate", { name: "Unbekannt" }), offen)).toMatchObject({ sicherheit: "moeglich" });
    expect(zuordnungVorschlag(u("3000.00", "Rate"), offen)).toBeNull();
  });

  it("Belastungen: EndToEnd-ID, Zahlungslauf-Nummer oder -Summe", () => {
    const offen = {
      anforderungen: [],
      zahlungslaeufe: [{ id: "L1", nr: "SL-2026-00001", summe: "58928.17", ausfuehrungAm: "2026-10-17" }],
      zahlungsausgaenge: [{ id: "Z1", endToEndId: "SL-2026-00001-AR-1", betrag: "29086.34", rechnungsnr: "AR-1", name: "Rohbau Muster KG" }],
    };
    expect(zuordnungVorschlag(u("-29086.34", "", { endToEndId: "SL-2026-00001-AR-1" }), offen)).toMatchObject({ art: "zahlungsausgang", sicherheit: "sicher", id: "Z1" });
    expect(zuordnungVorschlag(u("-58928.17", "SAMMEL-UEBERWEISUNG SL-2026-00001"), offen)).toMatchObject({ art: "zahlungslauf", sicherheit: "sicher", id: "L1" });
    expect(zuordnungVorschlag(u("-58928.17", "Sammler"), offen)).toMatchObject({ art: "zahlungslauf", sicherheit: "wahrscheinlich" });
    expect(zuordnungVorschlag(u("-25.50", "Kontofuehrung"), offen)).toBeNull();
  });
});
