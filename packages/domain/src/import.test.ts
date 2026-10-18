import { describe, expect, it } from "vitest";
import { csvLesen, importDatum, importPruefen, spaltenZuordnen, suchcodeVorschlag, textDekodieren } from "./import.js";

const leer = { schluessel: new Map<string, Record<string, unknown>>() };

describe("spaltenZuordnen", () => {
  it("erkennt Überschriften und Aliase unabhängig von Schreibweise", () => {
    const z = spaltenZuordnen("partner", ["Firmenname", "E-Mail Adresse", "Strasse", "Rolle", "Bemerkung"]);
    expect(Object.values(z.spalten)).toEqual(["firma", "email", "strasse", "rollen"]);
    expect(z.unbekannt).toEqual(["Bemerkung"]);
    expect(z.fehlendePflicht).toEqual([]);
  });
  it("meldet fehlende Pflichtspalten", () => {
    expect(spaltenZuordnen("einheiten", ["Nr.", "Fläche"]).fehlendePflicht).toEqual(["Typ"]);
  });
});

describe("Hilfsfunktionen", () => {
  it("wandelt deutsche Daten um", () => {
    expect(importDatum("1.2.2027")).toBe("2027-02-01");
    expect(importDatum("31.12.27")).toBe("2027-12-31");
    expect(importDatum("2027-03-04T00:00:00.000Z")).toBe("2027-03-04");
  });
  it("bildet Suchcodes ohne Rechtsform", () => {
    expect(suchcodeVorschlag("Müller Bau GmbH & Co. KG")).toBe("MUELLERBAU");
    expect(suchcodeVorschlag(null, "Weiß")).toBe("WEISS");
  });
  it("liest CSV mit Semikolon, Anführungszeichen und Zeilenumbrüchen", () => {
    expect(csvLesen('﻿Nr.;Firma\r\n1;"Bau ""Nord""; GmbH"\r\n2;"zwei\nZeilen"\r\n')).toEqual([
      ["Nr.", "Firma"],
      ["1", 'Bau "Nord"; GmbH'],
      ["2", "zwei\nZeilen"],
    ]);
    expect(csvLesen("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("erkennt Windows-1252", () => {
    expect(textDekodieren(new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]))).toBe("Müller");
    expect(textDekodieren(new TextEncoder().encode("Müller"))).toBe("Müller");
  });
});

describe("importPruefen – Partner", () => {
  const kopf = ["Nr.", "Firma", "Nachname", "Rollen", "E-Mail", "Freistellung gültig bis"];
  it("vergibt Nummern und Suchcodes und prüft Felder", () => {
    const p = importPruefen(
      "partner",
      [kopf, ["", "Dach Huber GmbH", "", "Handwerker, Lieferant", "", "31.12.2027"], ["10005", "", "Schmidt", "Käufer", "kaputt", ""], ["", "", "", "", "", ""], ["", "", "", "Bank", "", ""]],
      { schluessel: new Map(), hoechsteNr: 10004 },
    );
    expect(p.zeilen).toHaveLength(3);
    const [a, b, c] = p.zeilen;
    expect(a).toMatchObject({ zeile: 2, status: "neu", schluessel: "10006" });
    expect(a!.werte).toMatchObject({ suchcode: "DACHHUBER", rollen: ["handwerker", "lieferant"], freistellungGueltigBis: "2027-12-31" });
    expect(b).toMatchObject({ status: "fehler", fehler: ["E-Mail: Ungültige E-Mail-Adresse"] });
    expect(c!.fehler).toContain("Suchcode: Pflichtfeld");
    expect(p.bereit).toBe(false);
  });
  it("gleicht mit dem Bestand ab", () => {
    const bestand = { schluessel: new Map([["10001", { nr: 10001, suchcode: "HUBER", firma: "Huber", rollen: ["handwerker"] }]]), hoechsteNr: 10001 };
    const tab = [["Nr.", "Suchcode", "Firma", "Rollen"], ["10001", "HUBER", "Huber", "Handwerker"]];
    expect(importPruefen("partner", tab, bestand).zeilen[0]!.status).toBe("unveraendert");
    tab[1]![2] = "Huber Dach";
    expect(importPruefen("partner", tab, bestand).zeilen[0]!.fehler[0]).toMatch(/bereits vorhanden/);
    const mit = importPruefen("partner", tab, bestand, { aktualisieren: true });
    expect(mit.zeilen[0]!.status).toBe("aktualisieren");
    expect(mit.bereit).toBe(true);
  });
});

describe("importPruefen – Einheiten", () => {
  it("erkennt Typen, Zahlen im deutschen Format und Zugehörigkeit", () => {
    const p = importPruefen(
      "einheiten",
      [
        ["WE-Nr", "Typ", "Wohnfläche", "VK", "Gehört zu Nr."],
        ["W01", "Whg", "84,50", "498.550,00", ""],
        ["TG01", "TG-Stellplatz", "", "25.000", "W01"],
        ["TG02", "Stellplatz", "", "", "W99"],
        ["W01", "Wohnung", "", "", ""],
        ["X", "Schloss", "", "", ""],
      ],
      leer,
    );
    expect(p.zeilen.map((z) => z.status)).toEqual(["neu", "neu", "fehler", "fehler", "fehler"]);
    expect(p.zeilen[0]!.werte).toMatchObject({ typ: "wohnung", wohnflaeche: "84.50", vkBrutto: "498550.00", bauabschnitt: 1 });
    expect(p.zeilen[1]).toMatchObject({ zugehoerigZu: "W01", werte: { typ: "stellplatz", vkBrutto: "25000" } });
    expect(p.zeilen[2]!.fehler[0]).toMatch(/W99/);
    expect(p.zeilen[3]!.fehler).toEqual(["Nr. W01 steht schon in Zeile 2"]);
    expect(p.zeilen[4]!.fehler[0]).toMatch(/^Typ:/);
    expect(p.anzahl).toEqual({ neu: 2, aktualisieren: 0, unveraendert: 0, fehler: 3 });
  });
  it("ist ohne Pflichtspalte nicht bereit", () => {
    expect(importPruefen("einheiten", [["Nr."], ["W1"]], leer).bereit).toBe(false);
  });
});
