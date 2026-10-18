import { describe, expect, it } from "vitest";
import { STANDARD_GEWERKEPLAN } from "./gewerkeplan.js";
import {
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
