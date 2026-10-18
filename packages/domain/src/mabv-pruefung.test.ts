import { describe, expect, it } from "vitest";
import { ratenplanBerechnen, STANDARD_7_RATEN } from "./mabv.js";
import { money } from "./money.js";
import { abschnittFertigAm, mabvPruefung, type PruefVertrag } from "./mabv-pruefung.js";

const plan = ratenplanBerechnen(money("300000"), STANDARD_7_RATEN);
const basis = (x: Partial<PruefVertrag> = {}): PruefVertrag => ({
  erbbaurecht: false,
  vertragWirksam: true,
  vormerkungEingetragenAm: "2026-03-01",
  lastenfreistellungGesichert: true,
  buergschaftNach7: false,
  einheiten: [
    { id: "w", typ: "wohnung", vkBrutto: "280000" },
    { id: "s", typ: "stellplatz", vkBrutto: "20000" },
  ],
  meldungen: [
    { einheitId: "w", abschnitt: "erdarbeiten", fertigAm: "2026-04-10" },
    { einheitId: "w", abschnitt: "rohbau", fertigAm: "2026-09-30" },
  ],
  raten: plan.map((r) => ({ nr: r.nr, typ: "mabv", abschnitte: r.abschnitte, prozent: r.prozent.toFixed(4), betrag: r.betrag.toFixed(2), zahlungsanforderungId: r.nr === 1 ? "za1" : r.nr === 2 ? "za2" : null })),
  anforderungen: [
    { id: "za1", rechnungsnr: "ZA-2026-00001", angefordertAm: "2026-04-12", faelligAm: "2026-04-22", betrag: "90000" },
    { id: "za2", rechnungsnr: "ZA-2026-00002", angefordertAm: "2026-10-01", faelligAm: "2026-10-11", betrag: "84000" },
  ],
  buergschaften7: [],
  ...x,
});
const jahr = { von: "2026-01-01", bis: "2026-12-31" };

describe("MaBV-Prüfung", () => {
  it("bestätigt einen ordnungsgemäßen Vertrag", () => {
    const p = mabvPruefung(basis(), jahr);
    expect(p.feststellungen).toEqual([]);
    expect(p.anforderungen.map((a) => a.ordnungsgemaess)).toEqual([true, true]);
    expect(p.anforderungen[1]!.kumuliert).toBe("174000.00");
    expect(p.vertragssumme).toBe("300000.00");
  });

  it("ermittelt das Fertigstellungsdatum über alle Wohnungen, Stellplätze zählen nicht", () => {
    const v = basis({ einheiten: [{ id: "w", typ: "wohnung", vkBrutto: "1" }, { id: "w2", typ: "wohnung", vkBrutto: "1" }], meldungen: [{ einheitId: "w", abschnitt: "rohbau", fertigAm: "2026-09-01" }, { einheitId: "w2", abschnitt: "rohbau", fertigAm: "2026-09-20" }] });
    expect(abschnittFertigAm(v, "rohbau")).toBe("2026-09-20");
    expect(abschnittFertigAm(v, "dach")).toBeNull();
  });

  it("stellt Anforderung vor Bautenstand und vor Vormerkung fest", () => {
    const p = mabvPruefung(basis({ vormerkungEingetragenAm: "2026-04-20", meldungen: [{ einheitId: "w", abschnitt: "erdarbeiten", fertigAm: "2026-04-10" }, { einheitId: "w", abschnitt: "rohbau", fertigAm: "2026-10-05" }] }), jahr);
    expect(p.verstoesse).toBe(2);
    expect(p.feststellungen.map((f) => [f.art, f.rechnungsnr])).toEqual([
      ["voraussetzung", "ZA-2026-00001"],
      ["bautenstand", "ZA-2026-00002"],
    ]);
    expect(p.feststellungen[1]!.text).toMatch(/erst am 05.10.2026/);
    expect(p.anforderungen[0]!.ordnungsgemaess).toBe(false);
  });

  it("prüft nur Anforderungen im Zeitraum", () => {
    const p = mabvPruefung(basis({ vormerkungEingetragenAm: null }), { von: "2027-01-01", bis: "2027-12-31" });
    expect(p.feststellungen).toEqual([]);
    expect(p.anforderungen[0]!.ordnungsgemaess).toBeNull();
  });

  it("prüft bei § 7 die Deckung durch Bürgschaften statt der Voraussetzungen", () => {
    const v7 = (b: PruefVertrag["buergschaften7"]) => mabvPruefung(basis({ buergschaftNach7: true, vormerkungEingetragenAm: null, lastenfreistellungGesichert: false, buergschaften7: b }), jahr);
    expect(v7([{ betrag: "300000", ausgestelltAm: "2026-04-01", rueckgabeAm: null }]).feststellungen).toEqual([]);
    expect(v7([]).feststellungen[0]!.text).toMatch(/keine Bürgschaft/);
    expect(v7([{ betrag: "100000", ausgestelltAm: "2026-04-01", rueckgabeAm: null }]).feststellungen[0]!.text).toMatch(/decken die bis 01.10.2026 angeforderten 174000.00/);
    expect(v7([{ betrag: "300000", ausgestelltAm: null, rueckgabeAm: null }]).feststellungen.every((f) => f.schwere === "hinweis")).toBe(true);
  });

  it("stellt Abweichungen im Ratenplan fest", () => {
    const raten = basis().raten.map((r) => (r.nr === 2 ? { ...r, prozent: "30.0000" } : r));
    raten.push({ nr: 8, typ: "mabv", abschnitte: ["rohbau"], prozent: "1.0000", betrag: "0", zahlungsanforderungId: null });
    const p = mabvPruefung(basis({ raten }), jahr);
    const texte = p.feststellungen.filter((f) => f.art === "ratenplan").map((f) => f.text);
    expect(texte.some((t) => /8 Raten/.test(t))).toBe(true);
    expect(texte.some((t) => /mehrfach/.test(t) && /Rohbau/.test(t))).toBe(true);
    expect(texte.some((t) => /Rate 2: 30.0000 % statt höchstens 28.0000 %/.test(t))).toBe(true);
  });
});
