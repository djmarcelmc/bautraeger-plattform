import { datumPlusTage } from "./verkauf.js";

export type AufgabeBereich = "verkauf" | "kosten" | "maengel" | "sicherheiten" | "bau" | "steuern" | "einstellungen";
export type Dringlichkeit = "hoch" | "mittel" | "info";

export interface Aufgabe {
  bereich: AufgabeBereich;
  dringlichkeit: Dringlichkeit;
  titel: string;
  text: string;
  /** Maßgebliches Datum (Frist, Fälligkeit, Termin). */
  datum?: string | null;
  betrag?: string | null;
  projekt?: string | null;
  /** Pfad in der Weboberfläche. */
  link: string;
}

export const BEREICH_TEXT: Record<AufgabeBereich, string> = {
  verkauf: "Verkauf",
  kosten: "Kosten",
  maengel: "Mängel",
  sicherheiten: "Bürgschaften",
  bau: "Bau",
  steuern: "Steuern",
  einstellungen: "Einstellungen",
};

const RANG: Record<Dringlichkeit, number> = { hoch: 0, mittel: 1, info: 2 };

/** Nach Dringlichkeit, dann nach Datum (ohne Datum zuletzt), dann Titel. */
export function sortiereAufgaben(liste: Aufgabe[]): Aufgabe[] {
  return [...liste].sort((a, b) => RANG[a.dringlichkeit] - RANG[b.dringlichkeit] || (a.datum ?? "9999").localeCompare(b.datum ?? "9999") || a.titel.localeCompare(b.titel));
}

/** Dringlichkeit einer Frist: überschritten oder in ≤ tageHoch Tagen → hoch, in ≤ tageMittel Tagen → mittel. */
export function fristDringlichkeit(frist: string, stichtag: string, tageHoch = 3, tageMittel = 14): Dringlichkeit {
  if (frist <= datumPlusTage(stichtag, tageHoch)) return "hoch";
  if (frist <= datumPlusTage(stichtag, tageMittel)) return "mittel";
  return "info";
}

/** Basiszins des laufenden Halbjahres (01.01./01.07.) fehlt? */
export function basiszinsFehlt(saetze: { gueltigAb: string }[], stichtag: string) {
  const halbjahr = `${stichtag.slice(0, 4)}-${Number(stichtag.slice(5, 7)) < 7 ? "01" : "07"}-01`;
  return saetze.some((s) => s.gueltigAb === halbjahr) ? null : halbjahr;
}
