import { money, summe } from "./money.js";
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

const monatsname = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Anmeldezeiträume der Bauabzugsteuer (§ 48a EStG): Einbehalte eines Monats sind bis zum 10. des Folgemonats
 * anzumelden und abzuführen. Liefert Zeiträume, deren Termin höchstens 20 Tage zurück- bzw. 45 Tage vorausliegt.
 */
export function bauabzugTermine(zahlungen: { datum: string; bauabzugsteuer: string }[], stichtag: string) {
  const jeMonat = new Map<string, string[]>();
  for (const z of zahlungen) if (money(z.bauabzugsteuer).gt(0)) jeMonat.set(z.datum.slice(0, 7), [...(jeMonat.get(z.datum.slice(0, 7)) ?? []), z.bauabzugsteuer]);
  return [...jeMonat.entries()]
    .map(([monat, betraege]) => {
      const [j, m] = monat.split("-").map(Number);
      const faelligAm = new Date(Date.UTC(j!, m!, 10)).toISOString().slice(0, 10);
      return { monat, monatText: monatsname(`${monat}-01`), summe: summe(betraege.map(money)).toFixed(2), faelligAm };
    })
    .filter((t) => t.faelligAm >= datumPlusTage(stichtag, -20) && t.faelligAm <= datumPlusTage(stichtag, 45))
    .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
}

/** Basiszins des laufenden Halbjahres (01.01./01.07.) fehlt? */
export function basiszinsFehlt(saetze: { gueltigAb: string }[], stichtag: string) {
  const halbjahr = `${stichtag.slice(0, 4)}-${Number(stichtag.slice(5, 7)) < 7 ? "01" : "07"}-01`;
  return saetze.some((s) => s.gueltigAb === halbjahr) ? null : halbjahr;
}
