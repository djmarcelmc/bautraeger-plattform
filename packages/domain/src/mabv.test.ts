import { describe, expect, it } from "vitest";
import {
  MabvFehler,
  STANDARD_7_RATEN,
  rateAnforderbar,
  ratenplanBerechnen,
  ratenplanPruefen,
} from "./mabv.js";
import { formatDe, money, summe } from "./money.js";

describe("MaBV-Ratenplan", () => {
  // Beispielvertrag 23550 aus der Altsoftware: VK Einheit 316.930,00 + Stellplatz 8.000,00
  const vertragssumme = money("324930.00");

  it("berechnet die Raten des Beispielvertrags exakt", () => {
    const raten = ratenplanBerechnen(vertragssumme, STANDARD_7_RATEN);
    expect(raten.map((r) => r.prozent.toFixed(2))).toEqual([
      "30.00", "28.00", "18.90", "6.30", "11.20", "2.10", "3.50",
    ]);
    expect(raten.map((r) => formatDe(r.betrag))).toEqual([
      "97.479,00", "90.980,40", "61.411,77", "20.470,59", "36.392,16", "6.823,53", "11.372,55",
    ]);
    expect(summe(raten.map((r) => r.betrag)).equals(vertragssumme)).toBe(true);
  });

  it("gleicht Rundungsdifferenzen über die letzte Rate aus", () => {
    const raten = ratenplanBerechnen(money("100000.01"), STANDARD_7_RATEN);
    expect(summe(raten.map((r) => r.betrag)).toFixed(2)).toBe("100000.01");
  });

  it("nutzt bei Erbbaurecht 20 % als erste Rate", () => {
    const raten = ratenplanBerechnen(money(100000), STANDARD_7_RATEN, { erbbaurecht: true });
    expect(raten[0]!.prozent.toFixed(2)).toBe("20.00");
    expect(raten[1]!.prozent.toFixed(2)).toBe("32.00");
  });

  it("lehnt mehr als 7 Raten ab", () => {
    const zuViele = [
      ...STANDARD_7_RATEN.slice(0, 6),
      { abschnitte: ["fertigstellung" as const] },
    ];
    zuViele[2] = { abschnitte: ["dach", "heizung"] };
    zuViele.splice(3, 0, { abschnitte: ["sanitaer", "elektro", "fenster"] });
    expect(ratenplanPruefen(zuViele).join()).toMatch(/Höchstens 7 Raten/);
    expect(() => ratenplanBerechnen(vertragssumme, zuViele)).toThrow(MabvFehler);
  });

  it("erkennt fehlende und doppelte Abschnitte", () => {
    const fehler = ratenplanPruefen([
      { abschnitte: ["erdarbeiten", "erdarbeiten"] },
    ]);
    expect(fehler.some((f) => f.includes("mehrfach"))).toBe(true);
    expect(fehler.some((f) => f.includes("„rohbau“ fehlt"))).toBe(true);
  });
});

describe("Anforderbarkeit einer Rate", () => {
  const alleVoraussetzungen = {
    vertragWirksam: true,
    vormerkungEingetragen: true,
    lastenfreistellungGesichert: true,
    baugenehmigungVorhanden: true,
  };

  it("ist anforderbar, wenn Voraussetzungen erfüllt und Abschnitt fertig", () => {
    const r = rateAnforderbar(STANDARD_7_RATEN[0]!, new Set(["erdarbeiten"]), alleVoraussetzungen);
    expect(r).toEqual({ anforderbar: true, gruende: [] });
  });

  it("nennt alle Gründe, wenn etwas fehlt", () => {
    const r = rateAnforderbar(STANDARD_7_RATEN[2]!, new Set(["dach"]), {
      ...alleVoraussetzungen,
      vormerkungEingetragen: false,
    });
    expect(r.anforderbar).toBe(false);
    expect(r.gruende).toContain("Auflassungsvormerkung nicht eingetragen");
    expect(r.gruende).toContain("Bauabschnitt „fenster“ nicht fertiggemeldet");
  });

  it("Bürgschaft nach § 7 ersetzt die Voraussetzungen des § 3 Abs. 1", () => {
    const r = rateAnforderbar(STANDARD_7_RATEN[0]!, new Set(["erdarbeiten"]), {
      vertragWirksam: false,
      vormerkungEingetragen: false,
      lastenfreistellungGesichert: false,
      baugenehmigungVorhanden: false,
      buergschaftNach7: true,
    });
    expect(r.anforderbar).toBe(true);
  });
});
