import { describe, expect, it } from "vitest";
import { pruefkette } from "./handwerker.js";
import { money } from "./money.js";

describe("Prüfkette Handwerkerrechnung", () => {
  it("rechnet Nachlass, Umlagen, Einbehalt, Skonto und Bauabzugsteuer", () => {
    const r = pruefkette({
      geprueftKumuliert: money("100000.00"),
      nachlassProzent: 3,
      umlagenProzent: 1.5,
      einbehaltProzent: 5,
      bisherAbgegolten: money("40000.00"),
      skontoProzent: 2,
      freistellungGueltig: false,
    });
    expect(r.nachlass.toFixed(2)).toBe("3000.00");
    expect(r.nachNachlass.toFixed(2)).toBe("97000.00");
    expect(r.umlagen.toFixed(2)).toBe("1455.00");
    expect(r.einbehalt.toFixed(2)).toBe("4850.00");
    expect(r.anspruchKumuliert.toFixed(2)).toBe("90695.00");
    expect(r.faellig.toFixed(2)).toBe("50695.00");
    expect(r.skonto.toFixed(2)).toBe("1013.90");
    expect(r.bauabzugsteuer.toFixed(2)).toBe("7452.17");
    expect(r.auszahlung.toFixed(2)).toBe("42228.93");
  });

  it("zieht keine Bauabzugsteuer bei gültiger Freistellungsbescheinigung", () => {
    const r = pruefkette({ geprueftKumuliert: money(1000), freistellungGueltig: true });
    expect(r.bauabzugsteuer.isZero()).toBe(true);
    expect(r.auszahlung.toFixed(2)).toBe("1000.00");
  });

  it("zeigt Überzahlung als negativen fälligen Betrag ohne Skonto", () => {
    const r = pruefkette({
      geprueftKumuliert: money(1000),
      bisherAbgegolten: money(1200),
      skontoProzent: 3,
      freistellungGueltig: false,
    });
    expect(r.faellig.toFixed(2)).toBe("-200.00");
    expect(r.skonto.isZero()).toBe(true);
    expect(r.bauabzugsteuer.isZero()).toBe(true);
  });
});
