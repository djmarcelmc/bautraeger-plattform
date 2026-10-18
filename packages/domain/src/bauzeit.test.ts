import { describe, expect, it } from "vitest";
import { MABV_ABSCHNITTE } from "./mabv.js";
import { money } from "./money.js";
import {
  vertragsabfluss,
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

import { abstandAusTerminen, kritischerPfad, mindestAbstand, nachfolgerAnpassen, zirkelbezug, type PlanVorgang } from "./bauzeit.js";

describe("Abhängigkeiten", () => {
  const v = (id: string, beginn: string, ende: string, nach: [string, number][] = [], endeIst: string | null = null): PlanVorgang => ({
    id,
    beginn,
    ende,
    endeIst,
    abhaengigkeiten: nach.map(([vorgangId, abstandTage]) => ({ vorgangId, abstandTage })),
  });

  it("erkennt Zirkelbezüge", () => {
    expect(zirkelbezug([v("a", "2027-01-04", "2027-01-08", [["c", 0]]), v("b", "2027-01-11", "2027-01-15", [["a", 0]]), v("c", "2027-01-18", "2027-01-22", [["b", 0]])])).toEqual(["a", "c", "b"]);
    expect(zirkelbezug([v("a", "2027-01-04", "2027-01-08"), v("b", "2027-01-11", "2027-01-15", [["a", 0]])])).toBeNull();
    expect(zirkelbezug([v("a", "2027-01-04", "2027-01-08", [["a", 0]])])).toEqual(["a"]);
  });

  it("schiebt Nachfolger über mehrere Stufen und behält die Dauer", () => {
    // Rohbau verlängert sich um 2 Wochen → Zimmerer (Abstand 2 Tage) und Dachdecker rücken nach
    const plan = [
      v("roh", "2027-03-01", "2027-06-25"),
      v("zim", "2027-06-28", "2027-07-16", [["roh", 2]]),
      v("dach", "2027-07-19", "2027-08-13", [["zim", 2]]),
      v("fertig", "2027-02-01", "2027-02-05", [], "2027-02-05"),
    ];
    // Zimmerer startete laut Plan schon vor dem Mindestabstand: 25.06. + 1 + 2 = 28.06. passt genau
    expect(nachfolgerAnpassen(plan, ["roh"])).toEqual([]);
    plan[0]!.ende = "2027-07-09";
    expect(nachfolgerAnpassen(plan, ["roh"])).toEqual([
      { id: "zim", beginn: "2027-07-12", ende: "2027-07-30", tage: 14 },
      { id: "dach", beginn: "2027-08-02", ende: "2027-08-27", tage: 14 },
    ]);
  });

  it("verschiebt keine erledigten Vorgänge und zieht nichts nach vorne", () => {
    const plan = [v("a", "2027-01-04", "2027-01-29"), v("b", "2027-02-01", "2027-02-12", [["a", 0]], "2027-02-10"), v("c", "2027-03-01", "2027-03-05", [["a", 0]])];
    expect(nachfolgerAnpassen(plan, ["a"])).toEqual([]);
  });

  it("berücksichtigt Überlappung (negativer Abstand) und das Ist-Ende", () => {
    const plan = [v("a", "2027-01-04", "2027-01-29", [], "2027-02-05"), v("b", "2027-01-25", "2027-02-05", [["a", -5]])];
    expect(nachfolgerAnpassen(plan, ["a"])).toEqual([{ id: "b", beginn: "2027-02-01", ende: "2027-02-12", tage: 7 }]);
    expect(abstandAusTerminen("2027-01-29", "2027-01-25")).toBe(-5);
    expect(abstandAusTerminen("2027-06-25", "2027-06-28")).toBe(2);
  });

  it("findet den kritischen Pfad", () => {
    const plan = [
      v("a", "2027-01-04", "2027-01-15"),
      v("b", "2027-01-18", "2027-02-26", [["a", 2]]), // lang, schließt direkt an
      v("c", "2027-01-18", "2027-01-29", [["a", 2]]), // kurz, mit Puffer
      v("d", "2027-03-01", "2027-03-12", [["b", 2], ["c", 2]]),
    ];
    expect([...kritischerPfad(plan)].sort()).toEqual(["a", "b", "d"]);
  });

  it("hat in der Vorlage stimmige Abhängigkeiten ohne Zirkelbezug", () => {
    const plan = bauzeitenplanAusVorlage("2027-03-01");
    const mitIds = plan.map((x, i) => ({ id: String(i), beginn: x.beginn, ende: x.ende, endeIst: null, abhaengigkeiten: x.nach.map((n) => ({ vorgangId: String(n), abstandTage: mindestAbstand(plan[n]!.ende, x.beginn) })) }));
    expect(zirkelbezug(mitIds)).toBeNull();
    expect(nachfolgerAnpassen(mitIds, mitIds.map((x) => x.id))).toEqual([]);
    const kritisch = kritischerPfad(mitIds);
    // Bauende = Restarbeiten (24) nach Endreinigung (23); die Außenanlage (22) überlappt die Endreinigung und
    // bestimmt damit das Ende. Der Innenausbau (Bodenbeläge, Fliesen) hat laut Vorlage eine Woche Puffer.
    expect([...kritisch].sort()).toEqual(["22", "23", "24"]);
    expect(kritisch.has("2")).toBe(false); // Finanzierung läuft nur begleitend
    expect(mindestAbstand("2027-06-25", "2027-07-05")).toBe(2);
    expect(mindestAbstand("2027-06-25", "2027-06-28")).toBe(2);
    expect(mindestAbstand("2027-06-25", "2027-06-26")).toBe(0);
    expect(mindestAbstand("2027-06-25", "2027-06-21")).toBe(-5);
    expect(mitIds.filter((x) => x.abhaengigkeiten.length).length).toBe(20);
  });
});

describe("vertragsabfluss", () => {
  const basis = {
    summeVergeben: "100000",
    berechnet: "40000",
    abgegolten: "30000",
    nachlassProzent: 2,
    umlagenProzent: 0.5,
    einbehaltVertragserfuellungProzent: 10,
    einbehaltGewaehrleistungProzent: 5,
    skontoProzent: 3,
  };
  const text = (r: ReturnType<typeof vertragsabfluss>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toFixed(2)]));

  it("teilt nach Prüfkette auf: offene Rechnungen, Abschläge, Schlusszahlung, Gewährleistungseinbehalt", () => {
    expect(text(vertragsabfluss(basis))).toEqual({
      rechnungen: "4931.48", // (39.200 × 89,5 % − 30.000) × 97 %
      bauleistung: "51047.22", // (98.000 − 39.200) × 89,5 % × 97 %
      schlusszahlung: "4753.00", // 98.000 × (10 % − 5 %) × 97 %
      gewaehrleistung: "4900.00", // 98.000 × 5 %, nach Ablauf der Gewährleistung
      skontoErsparnis: "1878.30",
      einbehaltenBisher: "3920.00",
    });
  });

  it("ohne Skonto und mit Bürgschaften statt Einbehalten", () => {
    const r = text(vertragsabfluss({ ...basis, skontoNutzen: false, buergschaftVertragserfuellung: true, buergschaftGewaehrleistung: true }));
    expect(r).toMatchObject({ rechnungen: "9004.00", bauleistung: "58506.00", schlusszahlung: "0.00", gewaehrleistung: "0.00", skontoErsparnis: "0.00", einbehaltenBisher: "0.00" });
  });

  it("zahlt Überzahlungen nicht doppelt und rechnet Mehrabrechnung über die Vergabe hinaus", () => {
    const ueber = vertragsabfluss({ summeVergeben: "10000", berechnet: "4000", abgegolten: "6000" });
    expect(text(ueber)).toMatchObject({ rechnungen: "0.00", bauleistung: "4000.00", schlusszahlung: "0.00" });
    const mehr = vertragsabfluss({ summeVergeben: "10000", berechnet: "12000", abgegolten: "10000" });
    expect(text(mehr)).toMatchObject({ rechnungen: "2000.00", bauleistung: "0.00" });
  });
});
