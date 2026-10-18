import { describe, expect, it } from "vitest";
import { STANDARD_GEWERKEPLAN } from "./gewerkeplan.js";
import {
  auftragsrahmen,
  budgetPruefung,
  BudgetumbuchungEingabe,
  freiesBudget,
  umbuchungPruefen,
  umbuchungsQuellen,
  HandwerkervertragEingabe,
  freistellungGueltig,
  gewerkeplanAusVorlage,
  kostenstand,
  kostenstandSumme,
  skontoMoeglich,
  umlagenSumme,
} from "./kosten.js";
import { money } from "./money.js";

describe("Standard-Gewerkeplan", () => {
  it("hat eindeutige Nummern und summiert sich auf rund 100 %", () => {
    const nrn = STANDARD_GEWERKEPLAN.map((g) => g.nr);
    expect(new Set(nrn).size).toBe(nrn.length);
    const summe = STANDARD_GEWERKEPLAN.reduce((s, g) => s + g.anteilProzent, 0);
    expect(summe).toBeGreaterThan(99.9);
    expect(summe).toBeLessThan(100.1);
  });

  it("verteilt ein Budget auf die Gewerke", () => {
    const plan = gewerkeplanAusVorlage(money(4_000_000));
    expect(plan.find((g) => g.nr === 300)).toMatchObject({ bezeichnung: "Rohbau", geschaetztBrutto: "493200.00" });
    expect(plan.find((g) => g.nr === 100)!.geschaetztBrutto).toBe("771200.00");
  });
});

describe("Handwerkervertrag", () => {
  it("liest Formularwerte inkl. Umlagen und leerer Felder", () => {
    const v = HandwerkervertragEingabe.parse({
      gewerkId: "00000000-0000-4000-8000-000000000001",
      handwerkerId: "00000000-0000-4000-8000-000000000002",
      vertragBrutto: "822.100,00",
      skontoProzent: "3",
      skontoFristTage: "14",
      zahlungsfristTage: "",
      umlagen: { wasser: "0,3", strom: "0,3", bauschutt: "" },
      einbehaltVertragserfuellungProzent: "5",
    });
    expect(v).toMatchObject({ vertragBrutto: "822100.00", skontoFristTage: 14, zahlungsfristTage: null });
    expect(v.umlagen).toEqual({ wasser: "0.3", strom: "0.3", bauschutt: null });
    expect(umlagenSumme(v.umlagen)).toBeCloseTo(0.6);
  });

  it("lehnt Prozentwerte über 100 ab", () => {
    const r = HandwerkervertragEingabe.safeParse({
      gewerkId: "00000000-0000-4000-8000-000000000001",
      handwerkerId: "00000000-0000-4000-8000-000000000002",
      vertragBrutto: "1000",
      skontoProzent: "120",
    });
    expect(r.success).toBe(false);
  });
});

describe("Skonto und Bauabzugsteuer", () => {
  it("gewährt Skonto nur innerhalb der Frist", () => {
    expect(skontoMoeglich("2026-10-01", 14, "2026-10-15")).toBe(true);
    expect(skontoMoeglich("2026-10-01", 14, "2026-10-16")).toBe(false);
    expect(skontoMoeglich("2026-10-01", null, "2026-10-02")).toBe(false);
  });
  it("prüft die Freistellungsbescheinigung am Zahlungstag", () => {
    expect(freistellungGueltig("2026-12-31", "2026-10-15")).toBe(true);
    expect(freistellungGueltig("2026-09-30", "2026-10-15")).toBe(false);
    expect(freistellungGueltig(null, "2026-10-15")).toBe(false);
  });
});

describe("Kostenkontrolle", () => {
  it("nimmt die Schätzung, solange nichts vergeben ist", () => {
    expect(kostenstand("50000", [])).toMatchObject({ trend: "50000.00", abweichung: "0.00" });
  });

  it("rechnet Trend und Abweichung aus Vergabe und beauftragten Nachträgen", () => {
    const k = kostenstand("550000", [
      {
        vertragBrutto: "520000",
        nachtraege: [
          { betragBrutto: "12000", status: "beauftragt" },
          { betragBrutto: "8000", status: "angeboten" },
          { betragBrutto: "-2000", status: "abgerechnet" },
        ],
        berechnet: "300000",
        abgegolten: "270000",
      },
    ]);
    expect(k).toMatchObject({
      vergeben: "520000.00",
      nachtraege: "10000.00",
      summeVergeben: "530000.00",
      trend: "530000.00",
      abweichung: "20000.00",
      berechnet: "300000.00",
      bezahlt: "270000.00",
    });
    expect(kostenstandSumme([k, kostenstand("1000", [])]).trend).toBe("531000.00");
  });
});

describe("auftragsrahmen", () => {
  const n = [
    { betragBrutto: "5000", status: "beauftragt" },
    { betragBrutto: "3000", status: "angeboten" },
    { betragBrutto: "9999", status: "abgelehnt" },
  ];
  it("innerhalb, nahe und über dem Auftrag inkl. beauftragter Nachträge", () => {
    expect(auftragsrahmen("40000", "50000", n)).toMatchObject({ stufe: "ok", auftrag: "55000.00", auslastungProzent: 73, text: null });
    expect(auftragsrahmen("51000", "50000", n)).toMatchObject({ stufe: "nahe", auslastungProzent: 93 });
    expect(auftragsrahmen("51000", "50000", n, true).stufe).toBe("ok"); // Schlussrechnung ohne 90-%-Hinweis
    const ueber = auftragsrahmen("57000", "50000", n);
    expect(ueber).toMatchObject({ stufe: "ueber", ueberschreitung: "2000.00", angeboten: "3000.00" });
    expect(ueber.text).toBe("Rechnung (kumuliert 57.000,00 €) übersteigt den Auftrag von 55.000,00 € um 2.000,00 €. Angebotene Nachträge über 3.000,00 € würden das decken – vor der Freigabe beauftragen.");
    expect(auftragsrahmen("60000", "50000", n).text).toMatch(/Auch die angebotenen Nachträge \(3\.000,00 €\) reichen nicht/);
    expect(auftragsrahmen("60000", "50000", []).text).toMatch(/kein Nachtrag vor/);
    expect(auftragsrahmen("100", "0", []).text).toMatch(/keine Auftragssumme hinterlegt/);
  });
});

describe("budgetPruefung", () => {
  const st = (geschaetzt: string, summeVergeben: string, berechnet = "0", angeboten = "0") => ({ geschaetzt, summeVergeben, berechnet, angeboten });
  it("ruhig ohne Vertrag und unter der Schwelle", () => {
    expect(budgetPruefung(st("100000", "0")).stufe).toBe("ok");
    expect(budgetPruefung(st("100000", "85000"))).toMatchObject({ stufe: "ok", auslastungProzent: 85, text: null });
  });
  it("Hinweis ab Schwelle, einstellbar", () => {
    expect(budgetPruefung(st("100000", "92000"))).toMatchObject({ stufe: "nahe", auslastungProzent: 92 });
    expect(budgetPruefung(st("100000", "92000"), 95).stufe).toBe("ok");
    expect(budgetPruefung(st("100000", "80000"), 80).stufe).toBe("nahe");
  });
  it("Warnung bei Überschreitung, höherer berechneter Stand zählt", () => {
    const b = budgetPruefung(st("100000", "90000", "104000"));
    expect(b).toMatchObject({ stufe: "ueber", gebunden: "104000.00", ueberschreitung: "4000.00", auslastungProzent: 104 });
    expect(b.text).toContain("überschritten");
  });
  it("angebotene Nachträge, die das Budget sprengen würden", () => {
    const b = budgetPruefung(st("100000", "70000", "0", "35000"));
    expect(b.stufe).toBe("nahe");
    expect(b.text).toContain("angebotenen Nachträgen");
    expect(budgetPruefung(st("100000", "70000", "0", "10000")).stufe).toBe("ok");
  });
  it("ohne Budget, aber vergeben", () => {
    expect(budgetPruefung(st("0", "5000"))).toMatchObject({ stufe: "ueber", auslastungProzent: null });
  });
});

describe("kostenstand – Trend", () => {
  it("höherer geprüfter Rechnungsstand geht in den Trend ein", () => {
    const k = kostenstand("20000", [{ vertragBrutto: "18500", nachtraege: [{ betragBrutto: "4000", status: "angeboten" }], berechnet: "21420", abgegolten: "0" }]);
    expect(k).toMatchObject({ trend: "21420.00", abweichung: "-1420.00", angeboten: "4000.00" });
  });
});

describe("Budget umschichten", () => {
  const st = (geschaetzt: string, summeVergeben = "0", berechnet = "0") => kostenstand(geschaetzt, summeVergeben === "0" && berechnet === "0" ? [] : [{ vertragBrutto: summeVergeben, nachtraege: [], berechnet, abgegolten: "0" }]);
  it("freies Budget = Schätzung − gebundene Kosten, nie negativ", () => {
    expect(freiesBudget(st("100000", "80000")).toFixed(2)).toBe("20000.00");
    expect(freiesBudget(st("100000", "80000", "90000")).toFixed(2)).toBe("10000.00");
    expect(freiesBudget(st("20000", "18500", "21420")).toFixed(2)).toBe("0.00");
  });
  it("Quellen: vergebene Einsparungen zuerst, Ziel und Gewerke ohne freies Budget ausgenommen", () => {
    const g = [
      { id: "a", nr: 300, bezeichnung: "Rohbau", stand: st("100000", "80000"), vertraege: [1] },
      { id: "b", nr: 355, bezeichnung: "Fliesen", stand: st("20000", "18500", "21420"), vertraege: [1] },
      { id: "c", nr: 600, bezeichnung: "Außenanlagen", stand: st("50000"), vertraege: [] },
      { id: "d", nr: 400, bezeichnung: "Dach", stand: st("40000", "35000"), vertraege: [1] },
    ];
    expect(umbuchungsQuellen(g, "b").map((x) => [x.id, x.frei, x.gesichert])).toEqual([
      ["a", "20000.00", true],
      ["d", "5000.00", true],
      ["c", "50000.00", false],
    ]);
  });
  it("prüft Betrag gegen freies Budget und Eingabe", () => {
    expect(umbuchungPruefen({ nr: 400, bezeichnung: "Dach", stand: st("40000", "35000") }, "5000")).toBeNull();
    expect(umbuchungPruefen({ nr: 400, bezeichnung: "Dach", stand: st("40000", "35000") }, "5000.01")).toMatch(/nur 5\.000,00 € freies Budget/);
    expect(BudgetumbuchungEingabe.safeParse({ vonGewerkId: "6f1c2a52-6c5e-4c38-9c55-2b7e0f3b1a11", nachGewerkId: "6f1c2a52-6c5e-4c38-9c55-2b7e0f3b1a11", betrag: "100", begruendung: "x" }).success).toBe(false);
    expect(BudgetumbuchungEingabe.safeParse({ vonGewerkId: "6f1c2a52-6c5e-4c38-9c55-2b7e0f3b1a11", nachGewerkId: "7f1c2a52-6c5e-4c38-9c55-2b7e0f3b1a11", betrag: "1.420,00", begruendung: "Einsparung Rohbau" }).data?.betrag).toBe("1420.00");
  });
});
