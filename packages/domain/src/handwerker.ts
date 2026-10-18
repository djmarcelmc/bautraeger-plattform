import { Money, ZERO, prozentVon } from "./money.js";

/** Satz der Bauabzugsteuer nach § 48 EStG. */
export const BAUABZUGSTEUER_PROZENT = 15;

export interface PruefketteEingabe {
  /** Kumuliert geprüfter Rechnungsbetrag brutto (inkl. aller bisherigen Abschläge). */
  geprueftKumuliert: Money;
  nachlassProzent?: number;
  /** Summe der Umlagen in % (Wasser, Strom, Bauschutt, Bauwesenversicherung, Bauschild, Werbung …). */
  umlagenProzent?: number;
  /** Sicherheitseinbehalt in % (Vertragserfüllung bzw. Gewährleistung), sofern nicht durch Bürgschaft abgelöst. */
  einbehaltProzent?: number;
  /** Bisher abgegolten: Auszahlungen + gezogene Skonti + abgeführte Bauabzugsteuer. */
  bisherAbgegolten?: Money;
  /** Skonto in %, nur wenn innerhalb der Skontofrist gezahlt wird. */
  skontoProzent?: number;
  /** Gültige Freistellungsbescheinigung nach § 48b EStG liegt vor. */
  freistellungGueltig: boolean;
}

export interface PruefketteErgebnis {
  geprueftKumuliert: Money;
  nachlass: Money;
  nachNachlass: Money;
  umlagen: Money;
  einbehalt: Money;
  anspruchKumuliert: Money;
  bisherAbgegolten: Money;
  faellig: Money;
  skonto: Money;
  bauabzugsteuer: Money;
  auszahlung: Money;
}

/**
 * Prüfkette für Handwerker-Abschlags- und Schlussrechnungen (kumulierte Betrachtung).
 *
 * Annahmen (projektbezogen konfigurierbar machen, mit Steuerberater abstimmen):
 * - Umlagen und Einbehalt beziehen sich auf den Betrag nach Nachlass.
 * - Skonto bezieht sich auf den aktuell fälligen Betrag.
 * - Bauabzugsteuer wird auf die tatsächliche Gegenleistung (fällig − Skonto) einbehalten.
 */
export function pruefkette(e: PruefketteEingabe): PruefketteErgebnis {
  const nachlass = prozentVon(e.geprueftKumuliert, e.nachlassProzent ?? 0);
  const nachNachlass = e.geprueftKumuliert.minus(nachlass);
  const umlagen = prozentVon(nachNachlass, e.umlagenProzent ?? 0);
  const einbehalt = prozentVon(nachNachlass, e.einbehaltProzent ?? 0);
  const anspruchKumuliert = nachNachlass.minus(umlagen).minus(einbehalt);
  const bisherAbgegolten = e.bisherAbgegolten ?? ZERO;
  const faellig = anspruchKumuliert.minus(bisherAbgegolten);
  const skonto = faellig.isPositive() ? prozentVon(faellig, e.skontoProzent ?? 0) : ZERO;
  const gegenleistung = faellig.minus(skonto);
  const bauabzugsteuer =
    e.freistellungGueltig || !gegenleistung.isPositive()
      ? ZERO
      : prozentVon(gegenleistung, BAUABZUGSTEUER_PROZENT);
  return {
    geprueftKumuliert: e.geprueftKumuliert,
    nachlass,
    nachNachlass,
    umlagen,
    einbehalt,
    anspruchKumuliert,
    bisherAbgegolten,
    faellig,
    skonto,
    bauabzugsteuer,
    auszahlung: gegenleistung.minus(bauabzugsteuer),
  };
}
