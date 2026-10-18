import { describe, expect, it } from "vitest";
import { BASISZINSSAETZE_VORBELEGUNG, BasiszinsEingabe, BasiszinsFehlt, basiszinsAm, mahnvorschlag, verzugszinsen } from "./mahnwesen.js";
import { money } from "./money.js";

const saetze = BASISZINSSAETZE_VORBELEGUNG;

describe("Basiszins", () => {
  it("findet den gültigen Satz", () => {
    expect(basiszinsAm("2026-06-30", saetze).toFixed(2)).toBe("1.27");
    expect(basiszinsAm("2026-07-01", saetze).toFixed(2)).toBe("1.52");
    expect(basiszinsAm("2020-05-01", saetze).toFixed(2)).toBe("-0.88");
    expect(() => basiszinsAm("2010-01-01", saetze)).toThrow(BasiszinsFehlt);
  });
  it("akzeptiert nur Stichtage 01.01./01.07.", () => {
    expect(BasiszinsEingabe.safeParse({ gueltigAb: "2027-01-01", satz: "1,77" }).success).toBe(true);
    expect(BasiszinsEingabe.safeParse({ gueltigAb: "2027-02-01", satz: "1,77" }).success).toBe(false);
    expect(BasiszinsEingabe.parse({ gueltigAb: "2016-07-01", satz: "-0,88" }).satz).toBe("-0.88");
  });
});

describe("Verzugszinsen (tagesgenau, act/365)", () => {
  it("rechnet über den Wechsel des Basiszinssatzes zum 01.07.2026", () => {
    // Juni: 30 Tage × 6,27 %, Juli: 31 Tage × 6,52 % auf 10.000 €
    const r = verzugszinsen({ betrag: money(10000), verzugAb: "2026-06-01", bis: "2026-07-31", basiszinsen: saetze });
    expect(r.zinsen.toFixed(2)).toBe("106.91");
    expect(r.perioden.map((p) => [p.von, p.bis, p.tage, p.zinssatz])).toEqual([
      ["2026-06-01", "2026-06-30", 30, "6.27"],
      ["2026-07-01", "2026-07-31", 31, "6.52"],
    ]);
  });

  it("mindert das Kapital ab dem Tag der Teilzahlung", () => {
    const r = verzugszinsen({
      betrag: money(10000),
      verzugAb: "2026-06-01",
      bis: "2026-07-31",
      zahlungen: [{ datum: "2026-07-16", betrag: "4000" }],
      basiszinsen: saetze,
    });
    // 51,5342 (Juni) + 26,7945 (1.–15.7.) + 17,1485 (16.–31.7. auf 6.000 €)
    expect(r.zinsen.toFixed(2)).toBe("95.48");
    expect(r.perioden.at(-1)).toMatchObject({ von: "2026-07-16", kapital: "6000.00", tage: 16 });
  });

  it("endet mit vollständiger Zahlung und kennt Unternehmer- und feste Zinssätze", () => {
    const voll = verzugszinsen({ betrag: money(1000), verzugAb: "2026-07-01", bis: "2026-12-31", zahlungen: [{ datum: "2026-07-11", betrag: "1000" }], basiszinsen: saetze });
    expect(voll.perioden).toHaveLength(1);
    expect(voll.perioden[0]!.tage).toBe(10);
    const unternehmer = verzugszinsen({ betrag: money(36500), verzugAb: "2026-07-01", bis: "2026-07-10", basiszinsen: saetze, aufschlag: 9 });
    expect(unternehmer.zinsen.toFixed(2)).toBe("105.20"); // 36.500 × 10,52 % × 10/365
    const fest = verzugszinsen({ betrag: money(36500), verzugAb: "2026-06-25", bis: "2026-07-04", basiszinsen: saetze, festerZinssatz: "10" });
    expect(fest.zinsen.toFixed(2)).toBe("100.00");
    expect(fest.perioden).toHaveLength(1);
  });

  it("liefert 0 vor Verzugsbeginn", () => {
    expect(verzugszinsen({ betrag: money(1000), verzugAb: "2026-08-01", bis: "2026-07-31", basiszinsen: saetze }).zinsen.toFixed(2)).toBe("0.00");
  });
});

describe("Mahnvorschlag", () => {
  const a = { faelligAm: "2026-10-01", offen: money(1000), mahnstufe: 0, letzteFristBis: null, mahnsperre: false };
  it("erinnert nach Karenz, steigert nach Fristablauf, endet nach Stufe 3", () => {
    expect(mahnvorschlag(a, "2026-10-04").stufe).toBeNull();
    expect(mahnvorschlag(a, "2026-10-05").stufe).toBe(1);
    expect(mahnvorschlag({ ...a, mahnstufe: 1, letzteFristBis: "2026-10-12" }, "2026-10-12")).toEqual({ stufe: null, hinweis: "Mahnfrist läuft noch" });
    expect(mahnvorschlag({ ...a, mahnstufe: 1, letzteFristBis: "2026-10-12" }, "2026-10-13").stufe).toBe(2);
    expect(mahnvorschlag({ ...a, mahnstufe: 3, letzteFristBis: "2026-10-20" }, "2026-10-30").hinweis).toMatch(/rechtliche Schritte/);
  });
  it("beachtet Mahnsperre und bezahlte Posten", () => {
    expect(mahnvorschlag({ ...a, mahnsperre: true }, "2026-11-01").hinweis).toMatch(/Mahnsperre/);
    expect(mahnvorschlag({ ...a, offen: money(0) }, "2026-11-01").stufe).toBeNull();
  });
});
