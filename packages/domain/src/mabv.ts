import { D, Money, cent, summe } from "./money.js";

/** Bauabschnitte nach § 3 Abs. 2 MaBV. */
export type MabvAbschnitt =
  | "erdarbeiten"
  | "rohbau"
  | "dach"
  | "heizung"
  | "sanitaer"
  | "elektro"
  | "fenster"
  | "innenputz"
  | "estrich"
  | "fliesen"
  | "bezugsfertigkeit"
  | "fassade"
  | "fertigstellung";

export interface AbschnittDef {
  key: MabvAbschnitt;
  bezeichnung: string;
  /** Erdarbeiten: % der Vertragssumme; alle übrigen: % der restlichen Vertragssumme. */
  prozent: number;
}

export const MABV_ABSCHNITTE: readonly AbschnittDef[] = [
  { key: "erdarbeiten", bezeichnung: "nach Beginn der Erdarbeiten", prozent: 30 },
  { key: "rohbau", bezeichnung: "nach Rohbaufertigstellung einschließlich Zimmererarbeiten", prozent: 40 },
  { key: "dach", bezeichnung: "für die Herstellung der Dachflächen und Dachrinnen", prozent: 8 },
  { key: "heizung", bezeichnung: "für die Rohinstallation der Heizungsanlagen", prozent: 3 },
  { key: "sanitaer", bezeichnung: "für die Rohinstallation der Sanitäranlagen", prozent: 3 },
  { key: "elektro", bezeichnung: "für die Rohinstallation der Elektroanlagen", prozent: 3 },
  { key: "fenster", bezeichnung: "für den Fenstereinbau einschließlich der Verglasung", prozent: 10 },
  { key: "innenputz", bezeichnung: "für den Innenputz, ausgenommen Beiputzarbeiten", prozent: 6 },
  { key: "estrich", bezeichnung: "für den Estrich", prozent: 3 },
  { key: "fliesen", bezeichnung: "für die Fliesenarbeiten im Sanitärbereich", prozent: 4 },
  { key: "bezugsfertigkeit", bezeichnung: "nach Bezugsfertigkeit und Zug um Zug gegen Besitzübergabe", prozent: 12 },
  { key: "fassade", bezeichnung: "für die Fassadenarbeiten", prozent: 3 },
  { key: "fertigstellung", bezeichnung: "nach vollständiger Fertigstellung", prozent: 5 },
];

export const MABV_MAX_RATEN = 7;

export interface MabvOptionen {
  /** Bei Erbbaurecht beträgt die erste Rate 20 % statt 30 %. */
  erbbaurecht?: boolean;
}

/** Anteil eines Abschnitts an der gesamten Vertragssumme in Prozent (exakt, ungerundet). */
export function abschnittsAnteil(key: MabvAbschnitt, opt: MabvOptionen = {}) {
  const erste = opt.erbbaurecht ? 20 : 30;
  if (key === "erdarbeiten") return new D(erste);
  const def = MABV_ABSCHNITTE.find((a) => a.key === key)!;
  return new D(def.prozent).times(100 - erste).dividedBy(100);
}

export interface RateVorlage {
  bezeichnung?: string;
  abschnitte: MabvAbschnitt[];
}

export interface BerechneteRate {
  nr: number;
  bezeichnung: string;
  abschnitte: MabvAbschnitt[];
  prozent: InstanceType<typeof D>;
  betrag: Money;
}

export class MabvFehler extends Error {}

/** Prüft einen Ratenplan gegen § 3 Abs. 2 MaBV; liefert Fehlertexte (leer = gültig). */
export function ratenplanPruefen(raten: RateVorlage[]): string[] {
  const fehler: string[] = [];
  if (raten.length === 0) fehler.push("Ratenplan ist leer.");
  if (raten.length > MABV_MAX_RATEN)
    fehler.push(`Höchstens ${MABV_MAX_RATEN} Raten zulässig (§ 3 Abs. 2 MaBV), vorhanden: ${raten.length}.`);
  const gezaehlt = new Map<MabvAbschnitt, number>();
  for (const r of raten) {
    if (r.abschnitte.length === 0) fehler.push("Jede Rate braucht mindestens einen Bauabschnitt.");
    for (const a of r.abschnitte) gezaehlt.set(a, (gezaehlt.get(a) ?? 0) + 1);
  }
  for (const a of MABV_ABSCHNITTE) {
    const n = gezaehlt.get(a.key) ?? 0;
    if (n === 0) fehler.push(`Bauabschnitt „${a.key}“ fehlt im Ratenplan.`);
    if (n > 1) fehler.push(`Bauabschnitt „${a.key}“ ist mehrfach enthalten.`);
  }
  return fehler;
}

/**
 * Berechnet Prozentsätze und Beträge eines Ratenplans.
 * Rundungsdifferenzen werden der letzten Rate zugeschlagen, damit die Summe exakt der Vertragssumme entspricht.
 */
export function ratenplanBerechnen(
  vertragssumme: Money,
  raten: RateVorlage[],
  opt: MabvOptionen = {},
): BerechneteRate[] {
  const fehler = ratenplanPruefen(raten);
  if (fehler.length) throw new MabvFehler(fehler.join(" "));

  const ergebnis = raten.map((r, i) => {
    const prozent = r.abschnitte.reduce((s, a) => s.plus(abschnittsAnteil(a, opt)), new D(0));
    return {
      nr: i + 1,
      bezeichnung:
        r.bezeichnung ??
        r.abschnitte.map((a) => MABV_ABSCHNITTE.find((d) => d.key === a)!.bezeichnung).join("; "),
      abschnitte: r.abschnitte,
      prozent,
      betrag: cent(vertragssumme.times(prozent).dividedBy(100)),
    };
  });

  const diff = vertragssumme.minus(summe(ergebnis.map((r) => r.betrag)));
  const letzte = ergebnis.at(-1)!;
  letzte.betrag = letzte.betrag.plus(diff);
  return ergebnis;
}

/** Häufig genutzte Vorlage mit 7 Raten (entspricht dem Beispielvertrag aus der Altsoftware). */
export const STANDARD_7_RATEN: RateVorlage[] = [
  { abschnitte: ["erdarbeiten"] },
  { abschnitte: ["rohbau"] },
  { abschnitte: ["dach", "heizung", "sanitaer", "elektro", "fenster"] },
  { abschnitte: ["innenputz", "estrich"] },
  { abschnitte: ["bezugsfertigkeit", "fliesen"] },
  { abschnitte: ["fassade"] },
  { abschnitte: ["fertigstellung"] },
];

/** Fälligkeitsvoraussetzungen nach § 3 Abs. 1 MaBV. */
export interface Faelligkeitsvoraussetzungen {
  vertragWirksam: boolean;
  vormerkungEingetragen: boolean;
  lastenfreistellungGesichert: boolean;
  baugenehmigungVorhanden: boolean;
  /** Sicherheit nach § 7 MaBV ersetzt die Voraussetzungen des § 3 Abs. 1. */
  buergschaftNach7?: boolean;
}

export interface Anforderbarkeit {
  anforderbar: boolean;
  gruende: string[];
}

/** Darf eine Rate angefordert werden? Prüft Voraussetzungen und Bautenstand. */
export function rateAnforderbar(
  rate: RateVorlage,
  fertigeAbschnitte: ReadonlySet<MabvAbschnitt>,
  v: Faelligkeitsvoraussetzungen,
): Anforderbarkeit {
  const gruende: string[] = [];
  if (!v.buergschaftNach7) {
    if (!v.vertragWirksam) gruende.push("Vertrag nicht wirksam");
    if (!v.vormerkungEingetragen) gruende.push("Auflassungsvormerkung nicht eingetragen");
    if (!v.lastenfreistellungGesichert) gruende.push("Lastenfreistellung nicht gesichert");
    if (!v.baugenehmigungVorhanden) gruende.push("Baugenehmigung fehlt");
  }
  for (const a of rate.abschnitte)
    if (!fertigeAbschnitte.has(a)) gruende.push(`Bauabschnitt „${a}“ nicht fertiggemeldet`);
  return { anforderbar: gruende.length === 0, gruende };
}
