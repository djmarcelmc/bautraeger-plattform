import { describe, expect, it } from "vitest";
import { MangelEingabe, RuegeEingabe, datumPlusMonate, gewaehrleistungBis, mangelStatus, naechsteRuege } from "./maengel.js";

describe("Mangel-Eingabe", () => {
  it("liest ein Formular mit leeren Feldern und Werten", () => {
    const m = MangelEingabe.parse({
      projektId: "00000000-0000-4000-8000-000000000001",
      einheitId: "",
      festgestelltAm: "2025-02-08",
      titel: "Gutachten SV Dipl.-Ing. Maier vom 08.02.2025",
      mangelart: "Gewährleistungsmangel",
      wertHandwerkerBrutto: "200,00",
      eigentum: "gemeinschaft",
    });
    expect(m).toMatchObject({ einheitId: null, wertHandwerkerBrutto: "200.00", eigentum: "gemeinschaft", einbehalt: false });
    expect(MangelEingabe.safeParse({ projektId: "00000000-0000-4000-8000-000000000001", festgestelltAm: "", titel: "x" }).success).toBe(false);
  });

  it("verlangt eine Frist nach dem Rügedatum", () => {
    expect(RuegeEingabe.safeParse({ geruegtAm: "2025-03-05", fristBis: "2025-03-01" }).success).toBe(false);
    expect(RuegeEingabe.parse({ geruegtAm: "2025-03-05", fristBis: "" }).fristBis).toBeNull();
  });
});

describe("Rügen und Status", () => {
  it("schlägt Stufen 1–3 mit Standardfristen vor (wie im Beispiel der Altsoftware)", () => {
    expect(naechsteRuege(0, "2025-03-05")).toEqual({ stufe: 1, fristBis: "2025-03-19" });
    expect(naechsteRuege(1, "2025-05-06")).toEqual({ stufe: 2, fristBis: "2025-05-16" });
    expect(naechsteRuege(2, "2025-07-01")).toEqual({ stufe: 3, fristBis: "2025-07-08" });
    expect(naechsteRuege(3, "2025-08-01")).toBeNull();
  });

  it("ermittelt den Status", () => {
    const r = [{ fristBis: "2025-03-20" }];
    expect(mangelStatus({ erledigtAm: null }, [], "2025-03-01")).toBe("neu");
    expect(mangelStatus({ erledigtAm: null }, r, "2025-03-20")).toBe("frist_laeuft");
    expect(mangelStatus({ erledigtAm: null }, r, "2025-03-21")).toBe("ueberfaellig");
    expect(mangelStatus({ erledigtAm: null }, [{ fristBis: "2025-03-20", nachfristBis: "2025-04-01" }], "2025-03-25")).toBe("frist_laeuft");
    expect(mangelStatus({ erledigtAm: "2025-04-01" }, r, "2025-05-01")).toBe("erledigt");
  });
});

describe("Gewährleistung", () => {
  it("rechnet Monate inkl. Monatsende", () => {
    expect(datumPlusMonate("2017-07-03", 60)).toBe("2022-07-03");
    expect(datumPlusMonate("2025-08-31", 6)).toBe("2026-02-28");
    expect(datumPlusMonate("2027-08-31", 6)).toBe("2028-02-29");
  });
  it("liefert das Ende nur mit Abnahme und Frist", () => {
    expect(gewaehrleistungBis("2017-07-03", 60)).toBe("2022-07-03");
    expect(gewaehrleistungBis(null, 60)).toBeNull();
  });
});
