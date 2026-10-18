import { describe, expect, it } from "vitest";
import { AbnahmeAbschluss, AbnahmeEingabe, AbnahmeMaengelEingabe, MangelvorlageEingabe, STANDARD_MAENGEL } from "./abnahme.js";
import { STANDARD_GEWERKEPLAN } from "./gewerkeplan.js";

const UUID = "6b1f0c1e-5c2a-4c1e-9d1a-0a1b2c3d4e5f";

describe("Abnahme", () => {
  it("verlangt den passenden Vertrag je Art", () => {
    expect(AbnahmeEingabe.safeParse({ art: "sondereigentum", datum: "2027-07-09" }).success).toBe(false);
    expect(AbnahmeEingabe.safeParse({ art: "handwerker", datum: "2027-07-09", kaufvertragId: UUID }).success).toBe(false);
    expect(AbnahmeEingabe.parse({ art: "gemeinschaftseigentum", datum: "2027-07-09", einheitId: "" })).toMatchObject({ einheitId: null, zaehler: {} });
    expect(AbnahmeEingabe.parse({ art: "sondereigentum", datum: "2027-07-09", kaufvertragId: UUID, zaehler: { strom: "1234,5", gas: "" } }).zaehler).toEqual({ strom: "1234,5", gas: null });
  });
  it("übernimmt Abschlussangaben mit gesetzlicher Gewährleistung als Standard", () => {
    expect(AbnahmeAbschluss.parse({ ergebnis: "vorbehalt", gewaehrleistungMonate: "" })).toEqual({ ergebnis: "vorbehalt", vorbehaltVertragsstrafe: false, gewaehrleistungMonate: 60 });
    expect(AbnahmeAbschluss.parse({ ergebnis: "abgenommen", vorbehaltVertragsstrafe: "on", gewaehrleistungMonate: "48" })).toMatchObject({ vorbehaltVertragsstrafe: true, gewaehrleistungMonate: 48 });
    expect(AbnahmeAbschluss.safeParse({ ergebnis: "vielleicht" }).success).toBe(false);
  });
  it("braucht einen Mangel oder Vorlagen", () => {
    expect(AbnahmeMaengelEingabe.safeParse({ ort: "Bad" }).success).toBe(false);
    expect(AbnahmeMaengelEingabe.parse({ vorlageIds: UUID, ort: "Bad" }).vorlageIds).toEqual([UUID]);
  });
});

describe("Standardmängel", () => {
  it("verweisen nur auf Gewerke der Vorlage und sind gültig", () => {
    const nrs = new Set(STANDARD_GEWERKEPLAN.map((g) => g.nr));
    for (const m of STANDARD_MAENGEL) {
      if (m.gewerkNr !== null) expect(nrs.has(m.gewerkNr)).toBe(true);
      expect(MangelvorlageEingabe.safeParse({ ...m, gewerkNr: m.gewerkNr ?? "" }).success).toBe(true);
    }
    expect(STANDARD_MAENGEL.length).toBeGreaterThanOrEqual(30);
  });
});
