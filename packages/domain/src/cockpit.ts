import { datumPlusTage } from "./verkauf.js";

export type AufgabeBereich = "verkauf" | "kosten" | "maengel" | "sicherheiten" | "bau" | "steuern" | "buchhaltung" | "einstellungen";
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
  buchhaltung: "Buchhaltung",
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

// ------------------------------------------------------------------ Buchhaltung

export interface BuchhaltungsStand {
  gesellschaft: { id: string; nr: number; name: string; datevBereit: boolean };
  bank: { offen: number; aeltestes: string | null; letzterAuszugBis: string | null };
  /** Zahlungsläufe ohne zugeordneten Bankumsatz */
  laeufeOhneBeleg: { id: string; nr: string; ausfuehrungAm: string; summe: string }[];
  /** Noch nicht an DATEV übergebene Buchungen (Stand nach Abgleich, ohne zu speichern) */
  nichtExportiert: { anzahl: number; aeltestes: string | null };
  /** Freigegebene oder bezahlte Eingangsrechnungen ohne abgelegten Scan */
  rechnungenOhneBeleg: { anzahl: number; ersteId: string | null };
}

const dd = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Hinweise aus Bankabgleich und Buchhaltung je Gesellschaft:
 * offene Bankumsätze, Zahlungsläufe, die in vorliegenden Auszügen fehlen, Buchungen aus Vormonaten ohne DATEV-Export
 * (ab dem 10. des Monats dringlicher – Termin der Umsatzsteuer-Voranmeldung beim Steuerberater) und Rechnungen ohne Scan.
 */
export function buchhaltungsAufgaben(s: BuchhaltungsStand, stichtag: string): Aufgabe[] {
  const a: Aufgabe[] = [];
  const g = s.gesellschaft;
  const wer = `${g.nr} ${g.name}`;
  if (s.bank.offen)
    a.push({
      bereich: "buchhaltung",
      dringlichkeit: s.bank.aeltestes && s.bank.aeltestes <= datumPlusTage(stichtag, -14) ? "mittel" : "info",
      titel: `${s.bank.offen} ${s.bank.offen === 1 ? "Bankumsatz" : "Bankumsätze"} zuordnen`,
      text: `${wer}${s.bank.aeltestes ? `, ältester vom ${dd(s.bank.aeltestes)}` : ""} – Zahlungseingänge zählen erst nach der Zuordnung in offenen Posten und Mahnwesen`,
      datum: s.bank.aeltestes,
      link: `/bankabgleich?g=${g.id}`,
    });
  if (s.bank.letzterAuszugBis)
    for (const l of s.laeufeOhneBeleg) {
      if (datumPlusTage(l.ausfuehrungAm, 3) > s.bank.letzterAuszugBis) continue;
      a.push({
        bereich: "buchhaltung",
        dringlichkeit: "mittel",
        titel: `Zahlungslauf ${l.nr} nicht auf dem Konto`,
        text: `${wer}: ausgeführt am ${dd(l.ausfuehrungAm)}, Kontoauszüge liegen bis ${dd(s.bank.letzterAuszugBis)} vor – Ausführung bei der Bank prüfen oder im Bankabgleich zuordnen`,
        datum: l.ausfuehrungAm,
        betrag: l.summe,
        link: `/zahlungslaeufe/${l.id}`,
      });
    }
  const monatsbeginn = `${stichtag.slice(0, 7)}-01`;
  if (s.nichtExportiert.anzahl && s.nichtExportiert.aeltestes && s.nichtExportiert.aeltestes < monatsbeginn) {
    if (!g.datevBereit)
      a.push({ bereich: "buchhaltung", dringlichkeit: "info", titel: "DATEV-Berater- und Mandantennummer fehlen", text: `${wer}: ohne diese Angaben ist kein DATEV-Export möglich (${s.nichtExportiert.anzahl} Buchungen offen)`, link: `/gesellschaften/${g.id}` });
    else
      a.push({
        bereich: "buchhaltung",
        dringlichkeit: Number(stichtag.slice(8, 10)) >= 10 ? "mittel" : "info",
        titel: "Buchungen an DATEV übergeben",
        text: `${wer}: ${s.nichtExportiert.anzahl} Buchungen noch nicht exportiert, die älteste vom ${dd(s.nichtExportiert.aeltestes)}`,
        datum: s.nichtExportiert.aeltestes,
        link: `/buchhaltung?g=${g.id}&status=neu`,
      });
  }
  if (s.rechnungenOhneBeleg.anzahl)
    a.push({
      bereich: "buchhaltung",
      dringlichkeit: "info",
      titel: `${s.rechnungenOhneBeleg.anzahl} ${s.rechnungenOhneBeleg.anzahl === 1 ? "Rechnung" : "Rechnungen"} ohne Scan`,
      text: `${wer}: für das DATEV-Paket die Rechnungs-PDF an der Eingangsrechnung ablegen`,
      link: s.rechnungenOhneBeleg.anzahl === 1 && s.rechnungenOhneBeleg.ersteId ? `/eingangsrechnungen/${s.rechnungenOhneBeleg.ersteId}` : "/kosten",
    });
  return a;
}
