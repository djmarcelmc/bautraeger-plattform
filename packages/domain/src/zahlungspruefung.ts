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
  if (gezahlt.length && !gezahlt.includes(iban)) hinweise.push({ stufe: "kritisch", text: `Erste Zahlung an diese IBAN – bisher an ${gezahlt.map(kurz).join(", ")} gezahlt` });
  else if (!gezahlt.length) hinweise.push({ stufe: "hinweis", text: "Erste Zahlung an diesen Handwerker" });
  return { hinweise, bestaetigungNoetig: hinweise.some((h) => h.stufe === "kritisch"), gesperrt };
}
