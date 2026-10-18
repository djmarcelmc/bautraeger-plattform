import { describe, expect, it } from "vitest";
import { DatevExportEingabe, KONTIERUNG_STANDARD, belegnummer, journalAbgleich, journalSoll, kontierungFuer, personenkonto, type JournalIst, type JournalQuellen } from "./buchhaltung.js";

const k = KONTIERUNG_STANDARD["03"];
const leer: JournalQuellen = { anforderungen: [], uebergaben: [], eingaenge: [], rechnungen: [], ausgaenge: [], abfuehrungen: [] };

describe("Kontierung und Personenkonten", () => {
  it("nimmt den Standard des Kontenrahmens und passt die Personenkonten an die Sachkontenlänge an", () => {
    expect(kontierungFuer({ skr: "04" }).bank).toBe("1800");
    expect(kontierungFuer({ skr: "03", sachkontenlaenge: 5 })).toMatchObject({ debitorBasis: 100000, kreditorBasis: 700000 });
    expect(kontierungFuer({ skr: "03", kontierung: { ...k, bank: "1210" } }).bank).toBe("1210");
    // ältere gespeicherte Zuordnung ohne Erlöskonto: Rest bleibt erhalten, Erlöse aus dem Standard
    const { erloese: _, erloeseBu: __, ...alt } = { ...k, bank: "1210" };
    expect(kontierungFuer({ skr: "03", kontierung: alt })).toMatchObject({ bank: "1210", erloese: "8100" });
  });
  it("übernimmt Partnernummern mit Personenkontolänge, sonst Basis + Nummer", () => {
    expect(personenkonto(17, 10000)).toBe("10017");
    expect(personenkonto(70001, 70000)).toBe("70001");
    expect(personenkonto(17, 100000)).toBe("100017");
  });
  it("bereinigt Belegnummern für DATEV", () => {
    expect(belegnummer("RE 2026_17/a")).toBe("RE202617/a");
    expect(belegnummer("")).toBeNull();
  });
});

describe("journalSoll", () => {
  const q: JournalQuellen = {
    anforderungen: [{ id: "a1", kaufvertragId: "v1", rechnungsnr: "ZA-2026-00001", angefordertAm: "2026-10-01", betrag: "105000", debitorNr: 12, name: "Müller", kostenstelle: "101" }],
    uebergaben: [],
    eingaenge: [{ id: "e1", datum: "2026-10-09", betrag: "105000", debitorNr: 12, name: "Müller", rechnungsnr: "ZA-2026-00001", kostenstelle: "101" }],
    rechnungen: [{ id: "r1", rechnungsnr: "R 300", rechnungsdatum: "2026-10-02", betrag: "10000", kreditorNr: 70001, name: "Rohbau KG", kostenstelle: "101" }],
    ausgaenge: [{ id: "z1", datum: "2026-10-05", betrag: "8330", skonto: "200", bauabzugsteuer: "1470", kreditorNr: 70001, name: "Rohbau KG", rechnungsnr: "R 300", kostenstelle: "101" }],
    abfuehrungen: [{ id: "b1", abgefuehrtAm: "2026-11-10", abzugsbetrag: "1470", monat: "2026-10", name: "Rohbau KG" }],
  };

  it("bucht Verkauf, Kosten und Bauabzugsteuer doppelt mit Personenkonten", () => {
    const j = journalSoll(q, k);
    expect(j.map((b) => [b.quelleTyp, b.konto, b.gegenkonto, b.betrag])).toEqual([
      ["zahlungsanforderung", "10012", "1710", "105000.00"],
      ["zahlungseingang", "1200", "10012", "105000.00"],
      ["eingangsrechnung", "3100", "70001", "10000.00"],
      ["zahlungsausgang", "70001", "1200", "8330.00"],
      ["zahlungsausgang.skonto", "70001", "3730", "200.00"],
      ["zahlungsausgang.bauabzug", "70001", "1736", "1470.00"],
      ["bauabzug_abfuehrung", "1736", "1200", "1470.00"],
    ]);
    expect(j.every((b) => b.sollHaben === "S")).toBe(true);
    expect(j[2]).toMatchObject({ belegnr: "R300", buchungstext: "Rechnung Rohbau KG", kostenstelle: "101" });
  });

  it("lässt Nullbeträge weg und dreht negative Beträge", () => {
    const j = journalSoll({ ...leer, ausgaenge: [{ ...q.ausgaenge[0]!, skonto: "0", bauabzugsteuer: "0" }], anforderungen: [{ ...q.anforderungen[0]!, betrag: "-500" }] }, k);
    expect(j.map((b) => [b.quelleTyp, b.konto, b.gegenkonto, b.betrag])).toEqual([
      ["zahlungsanforderung", "1710", "10012", "500.00"],
      ["zahlungsausgang", "70001", "1200", "8330.00"],
    ]);
  });
});

describe("Übergabe", () => {
  const a = (id: string, datum: string, betrag: string) => ({ id, kaufvertragId: "v1", rechnungsnr: id, angefordertAm: datum, betrag, debitorNr: 12, name: "Müller", kostenstelle: "101" });
  const q: JournalQuellen = {
    ...leer,
    anforderungen: [a("ZA1", "2026-03-01", "90000"), a("ZA2", "2026-06-01", "120000"), a("ZA3", "2026-09-15", "25000")],
    uebergaben: [{ kaufvertragId: "v1", datum: "2026-09-01", vertragNr: "KV-101-002", name: "Müller", kostenstelle: "101" }],
  };

  it("bucht die bis zur Übergabe angeforderten Anzahlungen auf Erlöse um, spätere Anforderungen direkt auf Erlöse", () => {
    const j = journalSoll(q, k);
    expect(j.map((b) => [b.quelleTyp, b.belegnr, b.konto, b.gegenkonto, b.betrag])).toEqual([
      ["zahlungsanforderung", "ZA1", "10012", "1710", "90000.00"],
      ["zahlungsanforderung", "ZA2", "10012", "1710", "120000.00"],
      ["zahlungsanforderung", "ZA3", "10012", "8100", "25000.00"],
      ["uebergabe", "KV-101-002", "1710", "8100", "210000.00"],
    ]);
    expect(j[3]).toMatchObject({ belegdatum: "2026-09-01", buchungstext: "Übergabe KV-101-002 Müller", quelleId: "v1" });
  });

  it("Anforderung am Übergabetag zählt noch zu den Anzahlungen; ohne Anforderung keine Umbuchung", () => {
    const j = journalSoll({ ...q, anforderungen: [a("ZA1", "2026-09-01", "1000")] }, k);
    expect(j.map((b) => b.gegenkonto)).toEqual(["1710", "8100"]);
    expect(journalSoll({ ...q, anforderungen: [] }, k)).toEqual([]);
  });
});

describe("journalAbgleich", () => {
  const p = journalSoll({ ...leer, eingaenge: [{ id: "e1", datum: "2026-10-09", betrag: "1000", debitorNr: 12, name: "Müller", rechnungsnr: null, kostenstelle: null }] }, k)[0]!;
  const ist = (x: Partial<JournalIst> = {}): JournalIst => ({ ...p, id: "b1", exportiertAm: null, stornoVon: null, ...x });

  it("legt fehlende Buchungen an und lässt unveränderte stehen", () => {
    expect(journalAbgleich([p], [], "2026-10-18")).toMatchObject({ neu: [p], aendern: [], loeschen: [] });
    expect(journalAbgleich([p], [ist()], "2026-10-18")).toMatchObject({ neu: [], aendern: [], loeschen: [] });
  });

  it("passt nicht exportierte Buchungen an bzw. löscht sie", () => {
    const geaendert = { ...p, betrag: "1200.00" };
    expect(journalAbgleich([geaendert], [ist()], "2026-10-18")).toMatchObject({ neu: [], aendern: [{ id: "b1", werte: geaendert }], loeschen: [] });
    expect(journalAbgleich([], [ist()], "2026-10-18")).toMatchObject({ neu: [], loeschen: ["b1"] });
  });

  it("storniert exportierte Buchungen und bucht neu", () => {
    const geaendert = { ...p, betrag: "1200.00" };
    const r = journalAbgleich([geaendert], [ist({ exportiertAm: "2026-10-15T10:00:00Z" })], "2026-10-18");
    expect(r.stornos).toBe(1);
    expect(r.neu).toEqual([
      expect.objectContaining({ stornoVon: "b1", sollHaben: "H", betrag: "1000.00", belegdatum: "2026-10-18", buchungstext: "Storno Zahlung Müller", konto: "1200", gegenkonto: "10012" }),
      geaendert,
    ]);
    // weggefallene Quelle: nur Storno
    expect(journalAbgleich([], [ist({ exportiertAm: "2026-10-15T10:00:00Z" })], "2026-10-18").neu).toHaveLength(1);
  });

  it("betrachtet stornierte Buchungen als erledigt", () => {
    const geaendert = { ...p, betrag: "1200.00" };
    const vorher = [ist({ exportiertAm: "x" }), ist({ id: "s1", stornoVon: "b1", sollHaben: "H" }), { ...geaendert, id: "b2", exportiertAm: null, stornoVon: null }];
    expect(journalAbgleich([geaendert], vorher, "2026-10-18")).toMatchObject({ neu: [], aendern: [], loeschen: [] });
  });
});

describe("DatevExportEingabe", () => {
  const g = "00000000-0000-4000-8000-000000000001";
  it("verlangt einen Zeitraum innerhalb eines Wirtschaftsjahres", () => {
    expect(DatevExportEingabe.safeParse({ gesellschaftId: g, von: "2026-01-01", bis: "2026-10-31" }).data).toMatchObject({ nurNeue: true });
    expect(DatevExportEingabe.safeParse({ gesellschaftId: g, von: "2025-12-01", bis: "2026-01-31" }).success).toBe(false);
    expect(DatevExportEingabe.safeParse({ gesellschaftId: g, von: "2026-02-01", bis: "2026-01-31" }).success).toBe(false);
  });
});
