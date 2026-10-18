import { describe, expect, it } from "vitest";
import { basiszinsFehlt, fristDringlichkeit, sortiereAufgaben, type Aufgabe } from "./cockpit.js";

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

  it("erkennt einen fehlenden Basiszins", () => {
    expect(basiszinsFehlt([{ gueltigAb: "2026-07-01" }], "2026-10-18")).toBeNull();
    expect(basiszinsFehlt([{ gueltigAb: "2026-07-01" }], "2027-01-05")).toBe("2027-01-01");
  });
});
