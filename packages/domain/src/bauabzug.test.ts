import { describe, expect, it } from "vitest";
import { BauabzugAnmeldungEingabe, bauabzugFrist, bauabzugUebersicht } from "./bauabzug.js";

const G = "00000000-0000-4000-8000-000000000001";
const H1 = "00000000-0000-4000-8000-0000000000a1";
const H2 = "00000000-0000-4000-8000-0000000000a2";

describe("bauabzugFrist", () => {
  it("10. des Folgemonats, am Wochenende der Montag", () => {
    expect(bauabzugFrist("2026-09")).toBe("2026-10-12"); // 10.10.2026 ist ein Samstag
    expect(bauabzugFrist("2026-10")).toBe("2026-11-10");
    expect(bauabzugFrist("2026-12")).toBe("2027-01-11"); // 10.01.2027 ist ein Sonntag
  });
});

describe("bauabzugUebersicht", () => {
  const zahlungen = [
    { gesellschaftId: G, handwerkerId: H1, datum: "2026-10-05", betrag: "8500", bauabzugsteuer: "1500" },
    { gesellschaftId: G, handwerkerId: H1, datum: "2026-10-20", betrag: "4250", bauabzugsteuer: "750" },
    { gesellschaftId: G, handwerkerId: H2, datum: "2026-10-07", betrag: "1000", bauabzugsteuer: "0" },
    { gesellschaftId: G, handwerkerId: H2, datum: "2026-09-30", betrag: "1700", bauabzugsteuer: "300" },
  ];

  it("summiert Gegenleistung und Abzug je Monat und Handwerker", () => {
    const u = bauabzugUebersicht(zahlungen, [], "2026-10-25");
    expect(u.map((m) => m.monat)).toEqual(["2026-10", "2026-09"]);
    expect(u[0]).toMatchObject({ monatText: "Oktober 2026", faelligAm: "2026-11-10", ueberfaellig: false, offen: 1, summe: { gegenleistung: "15000.00", abzugsbetrag: "2250.00" } });
    expect(u[0]!.zeilen[0]).toMatchObject({ handwerkerId: H1, status: "offen" });
    expect(u[0]!.zeilen[0]!.zahlungen).toHaveLength(2);
    expect(u[1]).toMatchObject({ faelligAm: "2026-10-12", ueberfaellig: true });
  });

  it("erkennt angemeldet, abgeführt und Abweichungen", () => {
    const anm = (abzugsbetrag: string, abgefuehrtAm: string | null, monat = "2026-10", handwerkerId = H1) => ({ id: "x", gesellschaftId: G, handwerkerId, monat, gegenleistung: "0", abzugsbetrag, angemeldetAm: "2026-11-02", abgefuehrtAm });
    expect(bauabzugUebersicht(zahlungen, [anm("2250", null)], "2026-11-01")[0]!.zeilen[0]!.status).toBe("angemeldet");
    expect(bauabzugUebersicht(zahlungen, [anm("2250.00", "2026-11-05")], "2026-11-01")[0]!.zeilen[0]!.status).toBe("abgefuehrt");
    const abw = bauabzugUebersicht(zahlungen, [anm("1500", "2026-11-05")], "2026-11-01")[0]!;
    expect(abw.zeilen[0]!.status).toBe("abweichung");
    expect(abw.offen).toBe(1);
    // abgeführter Monat ist nicht mehr überfällig
    const sept = bauabzugUebersicht(zahlungen, [anm("300", "2026-10-09", "2026-09", H2)], "2026-10-25")[1]!;
    expect(sept).toMatchObject({ ueberfaellig: false, offen: 0, nichtAbgefuehrt: 0 });
  });
});

describe("BauabzugAnmeldungEingabe", () => {
  it("verlangt Monat und Anmeldedatum", () => {
    const r = BauabzugAnmeldungEingabe.safeParse({ gesellschaftId: G, handwerkerId: H1, monat: "2026-13", angemeldetAm: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual(expect.arrayContaining(["Monat im Format JJJJ-MM", "Datum der Anmeldung angeben"]));
  });
});
