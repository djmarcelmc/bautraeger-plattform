import { describe, expect, it } from "vitest";
import { basiszinsFehlt, buchhaltungsAufgaben, fristDringlichkeit, sortiereAufgaben, type Aufgabe } from "./cockpit.js";

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

describe("buchhaltungsAufgaben", () => {
  const basis = {
    gesellschaft: { id: "g1", nr: 3, name: "CUBI VIVIT", datevBereit: true },
    bank: { offen: 0, aeltestes: null, letzterAuszugBis: null },
    laeufeOhneBeleg: [],
    nichtExportiert: { anzahl: 0, aeltestes: null },
    rechnungenOhneBeleg: { anzahl: 0, ersteId: null },
  };
  it("ohne offene Punkte keine Hinweise", () => {
    expect(buchhaltungsAufgaben(basis, "2026-10-18")).toEqual([]);
  });
  it("offene Bankumsätze: nach 14 Tagen dringlicher", () => {
    const [a] = buchhaltungsAufgaben({ ...basis, bank: { offen: 3, aeltestes: "2026-10-10", letzterAuszugBis: "2026-10-17" } }, "2026-10-18");
    expect(a).toMatchObject({ bereich: "buchhaltung", dringlichkeit: "info", titel: "3 Bankumsätze zuordnen", link: "/bankabgleich?g=g1" });
    expect(buchhaltungsAufgaben({ ...basis, bank: { offen: 1, aeltestes: "2026-10-01", letzterAuszugBis: null } }, "2026-10-18")[0]).toMatchObject({ dringlichkeit: "mittel", titel: "1 Bankumsatz zuordnen" });
  });
  it("Zahlungslauf fehlt nur, wenn Auszüge bis 3 Tage nach Ausführung vorliegen", () => {
    const laeufeOhneBeleg = [
      { id: "l1", nr: "SL-2026-00001", ausfuehrungAm: "2026-10-10", summe: "1000.00" },
      { id: "l2", nr: "SL-2026-00002", ausfuehrungAm: "2026-10-16", summe: "500.00" },
    ];
    const a = buchhaltungsAufgaben({ ...basis, laeufeOhneBeleg, bank: { offen: 0, aeltestes: null, letzterAuszugBis: "2026-10-17" } }, "2026-10-18");
    expect(a.map((x) => x.titel)).toEqual(["Zahlungslauf SL-2026-00001 nicht auf dem Konto"]);
    expect(buchhaltungsAufgaben({ ...basis, laeufeOhneBeleg }, "2026-10-18")).toEqual([]); // noch kein Auszug eingelesen
  });
  it("DATEV-Export: nur Buchungen aus Vormonaten, ab dem 10. dringlicher; ohne Beraternummer Hinweis", () => {
    const n = { anzahl: 12, aeltestes: "2026-09-20" };
    expect(buchhaltungsAufgaben({ ...basis, nichtExportiert: n }, "2026-10-05")[0]).toMatchObject({ dringlichkeit: "info", titel: "Buchungen an DATEV übergeben", link: "/buchhaltung?g=g1&status=neu" });
    expect(buchhaltungsAufgaben({ ...basis, nichtExportiert: n }, "2026-10-12")[0]).toMatchObject({ dringlichkeit: "mittel" });
    expect(buchhaltungsAufgaben({ ...basis, nichtExportiert: { anzahl: 2, aeltestes: "2026-10-02" } }, "2026-10-12")).toEqual([]);
    expect(buchhaltungsAufgaben({ ...basis, gesellschaft: { ...basis.gesellschaft, datevBereit: false }, nichtExportiert: n }, "2026-10-12")[0]).toMatchObject({ titel: "DATEV-Berater- und Mandantennummer fehlen", link: "/gesellschaften/g1" });
  });
  it("Rechnungen ohne Scan", () => {
    expect(buchhaltungsAufgaben({ ...basis, rechnungenOhneBeleg: { anzahl: 1, ersteId: "r1" } }, "2026-10-18")[0]).toMatchObject({ titel: "1 Rechnung ohne Scan", link: "/eingangsrechnungen/r1" });
    expect(buchhaltungsAufgaben({ ...basis, rechnungenOhneBeleg: { anzahl: 4, ersteId: "r1" } }, "2026-10-18")[0]).toMatchObject({ link: "/kosten" });
  });
});
