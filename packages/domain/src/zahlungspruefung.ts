import { datumPlusTage } from "./verkauf.js";

// IBAN-Prüfung vor dem Zahlungslauf (Schutz vor Rechnungs- und Bankdatenbetrug): kürzlich geänderte Bankverbindung,
// abweichende IBAN auf der Rechnung, erste Zahlung an eine neue IBAN. Kritische Hinweise müssen vor dem Zahlungslauf
// bestätigt werden (z. B. Rückruf beim Handwerker unter bekannter Telefonnummer); wer die IBAN selbst geändert hat,
// darf die Zahlung nicht auslösen (Vier-Augen-Prinzip).

export const IBAN_AENDERUNG_FRIST_TAGE = 30;

export interface IbanAenderung {
  /** Zeitpunkt (ISO) */
  am: string;
  von: string;
  alt: string | null;
  neu: string | null;
  /** Partner neu angelegt (statt geändert) */
  angelegt?: boolean;
}

/** Dokumentierter Rückruf beim Handwerker zur Bestätigung einer Bankverbindung. */
export interface IbanBestaetigung {
  iban: string;
  /** Zeitpunkt der Dokumentation (ISO) */
  am: string;
  von: string;
  gespraechspartner: string;
}

export interface IbanPruefHinweis {
  stufe: "kritisch" | "hinweis";
  text: string;
}

export interface IbanPruefung {
  hinweise: IbanPruefHinweis[];
  bestaetigungNoetig: boolean;
  /** Grund, warum dieser Benutzer die Zahlung nicht auslösen darf */
  gesperrt: string | null;
}

const norm = (s: string | null | undefined) => (s ? s.replace(/\s/g, "").toUpperCase() : null);
const kurz = (iban: string) => `${iban.slice(0, 4)} … ${iban.slice(-4)}`;
const tag = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

export function ibanPruefen(e: {
  iban: string | null;
  aenderungen: IbanAenderung[];
  bisherGezahlt: string[];
  rechnungsIban: string | null;
  /** Dokumentierte Rückrufe (gelten für die IBAN, ab der letzten Änderung, nicht durch den Änderer) */
  bestaetigungen?: IbanBestaetigung[];
  stichtag: string;
  benutzer: string;
  vierAugen: boolean;
  fristTage?: number;
}): IbanPruefung {
  const hinweise: IbanPruefHinweis[] = [];
  let gesperrt: string | null = null;
  const iban = norm(e.iban);
  if (!iban) return { hinweise, bestaetigungNoetig: false, gesperrt };
  const rechnung = norm(e.rechnungsIban);
  if (rechnung && rechnung !== iban) hinweise.push({ stufe: "kritisch", text: `IBAN auf der Rechnung (${kurz(rechnung)}) weicht von der hinterlegten (${kurz(iban)}) ab` });
  const grenze = datumPlusTage(e.stichtag, -(e.fristTage ?? IBAN_AENDERUNG_FRIST_TAGE));
  const aenderung = [...e.aenderungen]
    .filter((a) => norm(a.neu) === iban && norm(a.alt) !== iban && a.am.slice(0, 10) >= grenze)
    .sort((a, b) => b.am.localeCompare(a.am))[0];
  if (aenderung) {
    if (aenderung.angelegt) hinweise.push({ stufe: "hinweis", text: `Handwerker am ${tag(aenderung.am)} mit dieser IBAN angelegt (von ${aenderung.von})` });
    else {
      hinweise.push({ stufe: "kritisch", text: `IBAN am ${tag(aenderung.am)} von ${aenderung.von} geändert${aenderung.alt ? ` (vorher ${kurz(norm(aenderung.alt)!)})` : ""}` });
      if (e.vierAugen && aenderung.von === e.benutzer) gesperrt = "Vier-Augen-Prinzip: Sie haben die IBAN selbst geändert – den Zahlungslauf muss eine andere Person erstellen.";
    }
  }
  const gezahlt = [...new Set(e.bisherGezahlt.map(norm).filter((x): x is string => !!x))];
  const neueIban = gezahlt.length > 0 && !gezahlt.includes(iban);
  if (neueIban) hinweise.push({ stufe: "kritisch", text: `Erste Zahlung an diese IBAN – bisher an ${gezahlt.map(kurz).join(", ")} gezahlt` });
  else if (!gezahlt.length) hinweise.push({ stufe: "hinweis", text: "Erste Zahlung an diesen Handwerker" });
  // Dokumentierter Rückruf entschärft „geändert“ und „erste Zahlung an diese IBAN“ – nicht die Abweichung zur Rechnung
  const letzteAenderung = [...e.aenderungen].filter((a) => !a.angelegt && norm(a.neu) === iban).sort((a, b) => b.am.localeCompare(a.am))[0];
  const rueckruf = (e.bestaetigungen ?? [])
    .filter((b) => norm(b.iban) === iban && (!letzteAenderung || b.am >= letzteAenderung.am) && !(e.vierAugen && letzteAenderung && b.von === letzteAenderung.von))
    .sort((a, b) => b.am.localeCompare(a.am))[0];
  if (rueckruf) {
    for (const h of hinweise) if (h.stufe === "kritisch" && !h.text.startsWith("IBAN auf der Rechnung")) h.stufe = "hinweis";
    hinweise.push({ stufe: "hinweis", text: `Rückruf am ${tag(rueckruf.am)} mit ${rueckruf.gespraechspartner} dokumentiert (${rueckruf.von})` });
  }
  return { hinweise, bestaetigungNoetig: hinweise.some((h) => h.stufe === "kritisch"), gesperrt };
}

/** Muss für die aktuelle IBAN noch ein Rückruf dokumentiert werden? (geändert innerhalb der Frist, ohne gültige Bestätigung) */
export function rueckrufOffen(e: { iban: string | null; aenderungen: IbanAenderung[]; bestaetigungen: IbanBestaetigung[]; stichtag: string; vierAugen: boolean; fristTage?: number }) {
  const iban = norm(e.iban);
  if (!iban) return null;
  const grenze = datumPlusTage(e.stichtag, -(e.fristTage ?? IBAN_AENDERUNG_FRIST_TAGE));
  const a = [...e.aenderungen].filter((x) => !x.angelegt && norm(x.neu) === iban && norm(x.alt) !== iban && x.am.slice(0, 10) >= grenze).sort((x, y) => y.am.localeCompare(x.am))[0];
  if (!a) return null;
  const ok = e.bestaetigungen.some((b) => norm(b.iban) === iban && b.am >= a.am && !(e.vierAugen && b.von === a.von));
  return ok ? null : a;
}
