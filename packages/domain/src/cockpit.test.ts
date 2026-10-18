import { describe, expect, it } from "vitest";
import { basiszinsFehlt, bauabzugTermine, fristDringlichkeit, sortiereAufgaben, type Aufgabe } from "./cockpit.js";

describe("Cockpit", () => {
  it("sortiert nach Dringlichkeit und Datum", () => {
    const a = (titel: string, dringlichkeit: Aufgabe["dringlichkeit"], datum?: string): Aufgabe => ({ bereich: "verkauf", titel, dringlichkeit, datum, text: "", link: "/" });
    expect(sortiereAufgaben([a("C", "info"), a("B", "hoch"), a("A", "hoch", "2026-10-01"), a("D", "mittel", "2026-09-01")]).map((x) => x.titel)).toEqual(["A", "B", "D", "C"]);
  });

  it("stuft Fristen ein", () => {
    expect(fristDringlichkeit("2026-10-10", "2026-10-18")).toBe("hoch");
    expect(fristDringlichkeit("2026-10-21", "2026-10-18")).toBe("hoch");
    expect(fristDringlichkeit("2026-10-30", "2026-10-18")).toBe("mittel");
    expect(fristDringlichkeit("2026-12-01", "2026-10-18")).toBe("info");
  });

  it("bildet Anmeldezeiträume der Bauabzugsteuer", () => {
    const t = bauabzugTermine(
      [
        { datum: "2026-09-12", bauabzugsteuer: "1500" },
        { datum: "2026-09-30", bauabzugsteuer: "500.50" },
        { datum: "2026-10-18", bauabzugsteuer: "5266.21" },
        { datum: "2026-10-19", bauabzugsteuer: "0" },
        { datum: "2026-05-02", bauabzugsteuer: "100" },
      ],
      "2026-10-18",
    );
    expect(t).toEqual([
      { monat: "2026-09", monatText: "September 2026", summe: "2000.50", faelligAm: "2026-10-10" },
      { monat: "2026-10", monatText: "Oktober 2026", summe: "5266.21", faelligAm: "2026-11-10" },
    ]);
    expect(bauabzugTermine([{ datum: "2026-12-05", bauabzugsteuer: "10" }], "2026-12-20")[0]!.faelligAm).toBe("2027-01-10");
  });

  it("erkennt einen fehlenden Basiszins", () => {
    expect(basiszinsFehlt([{ gueltigAb: "2026-07-01" }], "2026-10-18")).toBeNull();
    expect(basiszinsFehlt([{ gueltigAb: "2026-07-01" }], "2027-01-05")).toBe("2027-01-01");
  });
});
