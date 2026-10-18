import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import { BuergschaftEingabe, buergschaftStatus, pain001, rueckgabeFaelligAb, sepaText } from "./sepa.js";
import { GesellschaftEingabe, bicGueltig } from "./stammdaten.js";

describe("SEPA", () => {
  it("bereinigt Texte auf den SEPA-Zeichensatz", () => {
    expect(sepaText("Müller & Söhne GmbH – Fliesen", 70)).toBe("Mueller + Soehne GmbH - Fliesen");
    expect(sepaText("Rechnung Nr. 4711 vom 01.10.2026 <Restzahlung>", 30)).toBe("Rechnung Nr. 4711 vom 01.10.20");
  });

  it("prüft IBAN und BIC in den Stammdaten", () => {
    expect(bicGueltig("COBADEFFXXX")).toBe(true);
    expect(bicGueltig("COBADEF")).toBe(false);
    const g = GesellschaftEingabe.safeParse({ nr: 1, name: "Muster", iban: "DE89 3704 0044 0532 0130 00", bic: "cobadeffxxx" });
    expect(g.success && g.data).toMatchObject({ iban: "DE89370400440532013000", bic: "COBADEFFXXX" });
    expect(GesellschaftEingabe.safeParse({ nr: 1, name: "Muster", iban: "DE89 3704 0044 0532 0130 01" }).success).toBe(false);
  });

  it("erzeugt pain.001.001.09 mit Kontrollsumme", () => {
    const x = pain001({
      msgId: "SL-2026-00001",
      erstelltAm: "2026-10-18T10:15:00.000Z",
      ausfuehrungAm: "2026-10-20",
      auftraggeber: { name: "Muster Wohnbau GmbH", iban: "DE89370400440532013000", bic: "COBADEFFXXX" },
      zahlungen: [
        { endToEndId: "AR-1 Rohbau", betrag: money("31234.56"), name: "Rohbau Müller KG", iban: "DE02120300000000202051", verwendungszweck: "Rechnung AR-1 vom 01.10.2026" },
        { endToEndId: "F-77", betrag: money("1000"), name: "Fliesen <Söhne>", iban: "DE02500105170137075030", bic: "INGDDEFFXXX", verwendungszweck: "F-77" },
      ],
    });
    expect(x).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"');
    expect(x.match(/<CtrlSum>32234.56<\/CtrlSum>/g)).toHaveLength(2);
    expect(x.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2);
    expect(x).toContain("<ReqdExctnDt><Dt>2026-10-20</Dt></ReqdExctnDt>");
    expect(x).toContain("<Nm>Rohbau Mueller KG</Nm>");
    expect(x).toContain("<Nm>Fliesen Soehne</Nm>");
    expect(x).toContain("<EndToEndId>AR-1-Rohbau</EndToEndId>");
    expect(x).toContain("<CdtrAgt><FinInstnId><BICFI>INGDDEFFXXX</BICFI></FinInstnId></CdtrAgt>");
    expect(x).toContain("<CreDtTm>2026-10-18T10:15:00</CreDtTm>");
    expect(x.indexOf("<Amt>")).toBeLessThan(x.indexOf("<Cdtr>"));
  });
});

describe("Bürgschaften", () => {
  it("prüft Richtung und Art", () => {
    expect(BuergschaftEingabe.safeParse({ richtung: "erhalten", art: "gewaehrleistung", betrag: "5000" }).success).toBe(false);
    expect(BuergschaftEingabe.safeParse({ richtung: "erhalten", art: "mabv7", handwerkervertragId: "6b1f0c1e-5c2a-4c1e-9d1a-0a1b2c3d4e5f", betrag: "5000" }).success).toBe(false);
    expect(BuergschaftEingabe.parse({ richtung: "ausgegeben", art: "mabv7", kaufvertragId: "6b1f0c1e-5c2a-4c1e-9d1a-0a1b2c3d4e5f", betrag: "386.800,00", buergeId: "" })).toMatchObject({ betrag: "386800.00", buergeId: null });
  });

  it("bestimmt Rückgabezeitpunkt und Status", () => {
    expect(rueckgabeFaelligAb("gewaehrleistung", { abnahmeAm: "2026-03-31", gewaehrleistungMonate: 60 })).toBe("2031-03-31");
    expect(rueckgabeFaelligAb("vertragserfuellung", { abnahmeAm: "2026-03-31" })).toBe("2026-03-31");
    expect(rueckgabeFaelligAb("vorauszahlung", {})).toBeNull();
    const s = (b: Partial<{ gueltigBis: string; rueckgabeAm: string; rueckgabeFaelligAb: string }>) => buergschaftStatus({ gueltigBis: null, rueckgabeAm: null, rueckgabeFaelligAb: null, ...b }, "2026-10-18");
    expect(s({})).toBe("aktiv");
    expect(s({ rueckgabeAm: "2026-01-01", gueltigBis: "2025-01-01" })).toBe("zurueckgegeben");
    expect(s({ gueltigBis: "2026-10-17" })).toBe("abgelaufen");
    expect(s({ gueltigBis: "2026-12-01" })).toBe("laeuft_ab");
    expect(s({ gueltigBis: "2027-12-01", rueckgabeFaelligAb: "2026-10-18" })).toBe("rueckgabe_faellig");
  });
});
