import { describe, expect, it } from "vitest";
import { KONTIERUNG_STANDARD, journalSoll, type JournalQuellen } from "./buchhaltung.js";
import { money } from "./money.js";
import { datevSaldenLesen, kontensalden, offenePosten, saldenAbgleich } from "./saldenliste.js";

const k = KONTIERUNG_STANDARD["03"];
const q: JournalQuellen = {
  anforderungen: [
    { id: "a1", kaufvertragId: "v1", rechnungsnr: "ZA-1", angefordertAm: "2026-09-01", betrag: "90000", debitorNr: 17, name: "Müller", kostenstelle: "101" },
    { id: "a2", kaufvertragId: "v1", rechnungsnr: "ZA-2", angefordertAm: "2026-10-15", betrag: "60000", debitorNr: 17, name: "Müller", kostenstelle: "101" },
  ],
  uebergaben: [],
  eingaenge: [
    { id: "e1", zahlungsanforderungId: "a1", datum: "2026-09-10", betrag: "90000", debitorNr: 17, name: "Müller", rechnungsnr: "ZA-1", kostenstelle: "101" },
    { id: "e2", zahlungsanforderungId: "a2", datum: "2026-10-20", betrag: "20000", debitorNr: 17, name: "Müller", rechnungsnr: "ZA-2", kostenstelle: "101" },
  ],
  rechnungen: [{ id: "r1", rechnungsnr: "AR-1", rechnungsdatum: "2026-10-01", betrag: "10000", kreditorNr: 70001, name: "Rohbau KG", kostenstelle: "101" }],
  ausgaenge: [{ id: "z1", eingangsrechnungId: "r1", datum: "2026-10-05", betrag: "5100", skonto: "0", bauabzugsteuer: "900", kreditorNr: 70001, name: "Rohbau KG", rechnungsnr: "AR-1", kostenstelle: "101" }],
  abfuehrungen: [],
};

describe("kontensalden", () => {
  it("rechnet Soll positiv, Haben negativ; Storno (H) kehrt um; Stichtag", () => {
    const b = [
      { konto: "10017", gegenkonto: "1710", betrag: "100", sollHaben: "S" as const, belegdatum: "2026-10-01" },
      { konto: "10017", gegenkonto: "1710", betrag: "100", sollHaben: "H" as const, belegdatum: "2026-10-05" },
      { konto: "1200", gegenkonto: "10017", betrag: "40", sollHaben: "S" as const, belegdatum: "2026-10-03" },
    ];
    expect(kontensalden(b, "2026-10-04").get("10017")!.toFixed(2)).toBe("60.00");
    expect(kontensalden(b, "2026-10-31").get("10017")!.toFixed(2)).toBe("-40.00");
    expect(kontensalden(b, "2026-10-31").get("1710")!.toFixed(2)).toBe("0.00");
  });
});

describe("offenePosten und saldenAbgleich", () => {
  it("offene Posten je Personenkonto zum Stichtag", () => {
    expect(offenePosten(q, k, "2026-10-31").map((p) => [p.konto, p.beleg, p.offen])).toEqual([
      ["10017", "ZA-2", "40000.00"],
      ["70001", "AR-1", "-4000.00"],
    ]);
    expect(offenePosten(q, k, "2026-09-05").map((p) => [p.beleg, p.offen])).toEqual([["ZA-1", "90000.00"]]);
  });

  it("Journal aus denselben Vorgängen stimmt mit den offenen Posten überein; DATEV-Abweichung wird gezeigt", () => {
    const salden = kontensalden(journalSoll(q, k), "2026-10-31");
    const z = saldenAbgleich(salden, offenePosten(q, k, "2026-10-31"), { sachkontenlaenge: 4, kreditorBasis: 70000, datev: new Map([["10017", money("40000")], ["70001", money("-3500")]]) });
    expect(z.map((x) => [x.konto, x.art, x.journal, x.op, x.differenzOp, x.datev, x.differenzDatev])).toEqual([
      ["10017", "debitor", "40000.00", "40000.00", "0.00", "40000.00", "0.00"],
      ["70001", "kreditor", "-4000.00", "-4000.00", "0.00", "-3500.00", "-500.00"],
    ]);
  });

  it("Zahlung ohne Anforderung mindert die Forderung", () => {
    const p = offenePosten({ ...q, eingaenge: [...q.eingaenge, { id: "e3", zahlungsanforderungId: null, datum: "2026-10-25", betrag: "1000", debitorNr: 17, name: "Müller", rechnungsnr: null, kostenstelle: null }] }, k, "2026-10-31");
    expect(p.find((x) => x.beleg === "Zahlung ohne Anforderung")!.offen).toBe("-1000.00");
  });
});

describe("datevSaldenLesen", () => {
  it("liest Saldo mit S/H-Kennzeichen", () => {
    const r = datevSaldenLesen("Summen- und Saldenliste Debitoren\nKonto;Beschriftung;Saldo;S/H\n10017;Müller, Max;40.000,00;S\n70001;Rohbau KG;3.500,00;H\n;Summe;43.500,00;\n");
    expect(r.fehler).toBeNull();
    expect([...r.salden].map(([k, v]) => [k, v.toFixed(2)])).toEqual([
      ["10017", "40000.00"],
      ["70001", "-3500.00"],
    ]);
    expect(r.namen.get("10017")).toBe("Müller, Max");
  });
  it("liest getrennte Spalten Saldo Soll / Saldo Haben", () => {
    const r = datevSaldenLesen("Kontonummer;Kontobezeichnung;EB-Wert;Saldo Soll;Saldo Haben\n10017;Müller;0;40000,00;\n70001;Rohbau;0;;3500,00\n");
    expect(r.salden.get("70001")!.toFixed(2)).toBe("-3500.00");
  });
  it("meldet unbrauchbare Dateien", () => {
    expect(datevSaldenLesen("a;b\n1;2").fehler).toMatch(/Konto/);
    expect(datevSaldenLesen("Konto;Text\n10017;x").fehler).toMatch(/Saldo/);
  });
});
