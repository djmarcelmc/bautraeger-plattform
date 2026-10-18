import { describe, expect, it } from "vitest";
import { MABV_ABSCHNITTE } from "./mabv.js";
import { money } from "./money.js";
import {
  STANDARD_BAUZEITENPLAN,
  VorgangEingabe,
  bauzeitenplanAusVorlage,
  kalenderwoche,
  liquiditaetsplan,
  meilensteinDatum,
  montag,
  verteileWoechentlich,
} from "./bauzeit.js";

describe("Kalenderwochen", () => {
  it("bestimmt Montag und ISO-Kalenderwoche", () => {
    expect(montag("2026-10-18")).toBe("2026-10-12"); // Sonntag → Montag davor
    expect(montag("2026-10-19")).toBe("2026-10-19");
    expect(kalenderwoche("2026-10-19")).toEqual({ jahr: 2026, woche: 43 });
    expect(kalenderwoche("2027-01-01")).toEqual({ jahr: 2026, woche: 53 }); // Freitag gehört zur KW 53/2026
    expect(kalenderwoche("2025-12-29")).toEqual({ jahr: 2026, woche: 1 });
  });
});

describe("Bauzeitenplan-Vorlage", () => {
  it("enthält jeden MaBV-Abschnitt genau einmal", () => {
    const abschnitte = STANDARD_BAUZEITENPLAN.flatMap((v) => (v.mabvAbschnitt ? [v.mabvAbschnitt] : []));
    expect(abschnitte.sort()).toEqual(MABV_ABSCHNITTE.map((a) => a.key).sort());
  });
  it("legt Termine relativ zum Baubeginn an", () => {
    const plan = bauzeitenplanAusVorlage("2027-03-01");
    const erd = plan.find((v) => v.mabvAbschnitt === "erdarbeiten")!;
    expect(erd).toMatchObject({ beginn: "2027-03-01", ende: "2027-03-19" }); // 3 Wochen, endet freitags
    expect(plan[0]!.beginn).toBe("2026-12-07"); // Grundstück 12 Wochen vorher
    expect(meilensteinDatum({ ...erd, endeIst: null })).toBe("2027-03-01");
    const roh = plan.find((v) => v.mabvAbschnitt === "rohbau")!;
    expect(meilensteinDatum({ ...roh, endeIst: "2027-07-30" })).toBe("2027-07-30");
  });
  it("prüft Vorgänge", () => {
    const r = VorgangEingabe.safeParse({ bezeichnung: "Rohbau", beginn: "2027-03-10", ende: "2027-03-01", mabvAbschnitt: "" });
    expect(r.success).toBe(false);
    const ok = VorgangEingabe.parse({ bezeichnung: "Rohbau", beginn: "2027-03-01", ende: "2027-03-10", mabvAbschnitt: "", nr: "" });
    expect(ok).toMatchObject({ gewerkIds: [], mabvAbschnitt: null, nr: null });
  });
});

describe("verteileWoechentlich", () => {
  it("verteilt centgenau auf die Wochen", () => {
    const v = verteileWoechentlich(money("100"), "2026-11-02", "2026-11-20", "2026-10-18");
    expect(v.map((x) => x.datum)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(v.map((x) => x.betrag.toFixed(2))).toEqual(["33.33", "33.33", "33.34"]);
  });
  it("legt Vergangenes in die aktuelle Woche", () => {
    expect(verteileWoechentlich(money("50"), "2026-08-03", "2026-09-04", "2026-10-18").map((x) => x.datum)).toEqual(["2026-10-12"]);
    expect(verteileWoechentlich(money("90"), "2026-09-28", "2026-10-30", "2026-10-18").map((x) => x.datum)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});

describe("liquiditaetsplan", () => {
  it("summiert je Woche, führt den Bestand fort und weist Überfälliges, Späteres und Unterminiertes aus", () => {
    const p = liquiditaetsplan(
      [
        { richtung: "ein", art: "angefordert", datum: "2026-10-01", betrag: "1000" }, // überfällig → KW 42
        { richtung: "ein", art: "raten", datum: "2026-10-28", betrag: "5000" },
        { richtung: "aus", art: "bauleistung", datum: "2026-10-19", betrag: "8000" },
        { richtung: "aus", art: "rechnungen", datum: "2026-10-15", betrag: "500" },
        { richtung: "ein", art: "raten", datum: "2027-06-01", betrag: "7000" },
        { richtung: "aus", art: "bauleistung", datum: null, betrag: "300" },
      ],
      { stichtag: "2026-10-18", wochen: 3, anfangsbestand: "2000" },
    );
    expect(p.wochen.map((w) => [w.woche, w.einSumme, w.ausSumme, w.bestand])).toEqual([
      [42, "1000.00", "500.00", "2500.00"],
      [43, "0.00", "8000.00", "-5500.00"],
      [44, "5000.00", "0.00", "-500.00"],
    ]);
    expect(p.tiefstand).toEqual({ bestand: "-5500.00", woche: { jahr: 2026, woche: 43 } });
    expect(p.ueberfaellig).toEqual({ ein: "1000.00", aus: "0.00" });
    expect(p.spaeter.ein).toBe("7000.00");
    expect(p.ohneTermin.aus).toBe("300.00");
    expect(p.wochen[0]!.ein).toEqual({ angefordert: "1000.00" });
    expect(p.summe).toEqual({ ein: "6000.00", aus: "8500.00", endbestand: "-500.00" });
  });
});
