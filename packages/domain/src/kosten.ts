import { z } from "zod";
import { datum, dezimal, ganzzahl, ganzzahlOptional, geld, pflichttext, text } from "./felder.js";
import { STANDARD_GEWERKEPLAN } from "./gewerkeplan.js";
import { cent, money, summe, ZERO, type Money } from "./money.js";
import { datumPlusTage } from "./verkauf.js";

// ---------------------------------------------------------------- Eingaben

const positiv = (feld: string) => geld().refine((b) => !!b && money(b).gt(0), `${feld} > 0 angeben`);

export const GewerkEingabe = z.object({
  nr: ganzzahl().positive(),
  gruppe: text(100),
  bezeichnung: pflichttext(100),
  geschaetztBrutto: geld().transform((v) => v ?? "0"),
});
export type GewerkEingabe = z.infer<typeof GewerkEingabe>;

export const GewerkeplanEingabe = z.object({ budgetBrutto: positiv("Budget") });

export const UMLAGE_ARTEN = ["wasser", "strom", "bauschutt", "bauwesenversicherung", "bauschild", "werbung", "sonstiges"] as const;
export const UMLAGE_TEXT: Record<(typeof UMLAGE_ARTEN)[number], string> = {
  wasser: "Wasseranschluss",
  strom: "Stromanschluss",
  bauschutt: "Bauschutt",
  bauwesenversicherung: "Bauwesenversicherung",
  bauschild: "Bauschild",
  werbung: "Werbung",
  sonstiges: "Sonstiges",
};

const prozent = () => dezimal(4).refine((v) => v === null || v === undefined || (Number(v) >= 0 && Number(v) <= 100), "0 bis 100 %");

export const HandwerkervertragEingabe = z.object({
  gewerkId: z.uuid("Gewerk wählen"),
  handwerkerId: z.uuid("Handwerker wählen"),
  nrIntern: text(40),
  angebotVom: datum(),
  vertragVom: datum(),
  vertragBrutto: positiv("Auftragssumme"),
  nachlassProzent: prozent(),
  skontoProzent: prozent(),
  skontoFristTage: ganzzahlOptional(0, 90),
  zahlungsfristTage: ganzzahlOptional(0, 120),
  umlagen: z.partialRecord(z.enum(UMLAGE_ARTEN), prozent()).default({}),
  einbehaltVertragserfuellungProzent: prozent(),
  einbehaltGewaehrleistungProzent: prozent(),
  gewaehrleistungMonate: ganzzahlOptional(0, 120),
  abnahmeAm: datum(),
});
export type HandwerkervertragEingabe = z.infer<typeof HandwerkervertragEingabe>;

export const NACHTRAG_STATUS = ["angeboten", "beauftragt", "abgelehnt", "abgerechnet"] as const;
export const NachtragEingabe = z.object({
  text: pflichttext(300),
  betragBrutto: geld().refine((b) => !!b && !money(b).isZero(), "Betrag angeben"),
  status: z.enum(NACHTRAG_STATUS).default("angeboten"),
});
export type NachtragEingabe = z.infer<typeof NachtragEingabe>;

export const EingangsrechnungEingabe = z.object({
  handwerkervertragId: z.uuid(),
  rechnungsnr: pflichttext(60),
  rechnungsdatum: datum().refine((d) => !!d, "Rechnungsdatum angeben"),
  eingangAm: datum().refine((d) => !!d, "Eingangsdatum angeben"),
  schlussrechnung: z.boolean().default(false),
  /** Rechnungsbetrag brutto – bei Abschlagsrechnungen kumuliert (Gesamtleistung bis heute). */
  betragBrutto: positiv("Rechnungsbetrag"),
});
export type EingangsrechnungEingabe = z.infer<typeof EingangsrechnungEingabe>;

export const RechnungPruefen = z.object({
  geprueftKumuliert: geld().refine((b) => b !== null && b !== undefined && money(b).gte(0), "Geprüften Betrag angeben"),
  bemerkung: text(500),
});
export const RechnungZahlung = z.object({ datum: datum().refine((d) => !!d, "Zahlungsdatum angeben") });

export const RECHNUNG_STATUS_TEXT: Record<string, string> = {
  erfasst: "zu prüfen",
  sachlich_geprueft: "geprüft",
  rechnerisch_geprueft: "geprüft",
  freigegeben: "freigegeben",
  bezahlt: "bezahlt",
};

// ---------------------------------------------------------------- Logik

/** Gewerke aus der Vorlage mit Schätzkosten = Budget × Anteil. */
export function gewerkeplanAusVorlage(budget: Money, vorlage = STANDARD_GEWERKEPLAN) {
  return vorlage.map((v) => ({
    nr: v.nr,
    gruppe: v.gruppe,
    bezeichnung: v.bezeichnung,
    geschaetztBrutto: cent(budget.times(v.anteilProzent).dividedBy(100)).toFixed(2),
  }));
}

export const umlagenSumme = (umlagen: Partial<Record<string, string | number | null | undefined>>) =>
  Object.values(umlagen).reduce<number>((s, v) => s + (v ? Number(v) : 0), 0);

/** Skonto nur, wenn innerhalb der Skontofrist (ab Rechnungseingang) gezahlt wird. */
export function skontoMoeglich(eingangAm: string, skontoFristTage: number | null | undefined, zahlungsdatum: string) {
  if (!skontoFristTage && skontoFristTage !== 0) return false;
  return zahlungsdatum <= datumPlusTage(eingangAm, skontoFristTage);
}

/** Freistellungsbescheinigung (§ 48b EStG) gilt am Zahlungstag? */
export const freistellungGueltig = (gueltigBis: string | null | undefined, zahlungsdatum: string) =>
  !!gueltigBis && gueltigBis >= zahlungsdatum;

export interface VertragKosten {
  vertragBrutto: string;
  nachtraege: { betragBrutto: string; status: string }[];
  /** Zuletzt geprüfter kumulierter Rechnungsbetrag. */
  berechnet: string;
  /** Abgegolten = Auszahlungen + Skonto + Bauabzugsteuer. */
  abgegolten: string;
}

/**
 * Kostenstand eines Gewerks. Trendkosten: sobald vergeben, zählt die Auftragssumme inkl. beauftragter Nachträge,
 * sonst die Schätzung. Abweichung = geschätzt − Trend (positiv = Einsparung).
 */
export function kostenstand(geschaetztBrutto: string, vertraege: VertragKosten[]) {
  const geschaetzt = money(geschaetztBrutto);
  const vergeben = summe(vertraege.map((v) => money(v.vertragBrutto)));
  const nachtraege = summe(
    vertraege.flatMap((v) => v.nachtraege.filter((n) => n.status === "beauftragt" || n.status === "abgerechnet").map((n) => money(n.betragBrutto))),
  );
  const summeVergeben = vergeben.plus(nachtraege);
  const trend = vertraege.length ? summeVergeben : geschaetzt;
  const f = (m: Money) => m.toFixed(2);
  return {
    geschaetzt: f(geschaetzt),
    vergeben: f(vergeben),
    nachtraege: f(nachtraege),
    summeVergeben: f(summeVergeben),
    berechnet: f(summe(vertraege.map((v) => money(v.berechnet)))),
    bezahlt: f(summe(vertraege.map((v) => money(v.abgegolten)))),
    trend: f(trend),
    abweichung: f(geschaetzt.minus(trend)),
  };
}
export type Kostenstand = ReturnType<typeof kostenstand>;

/** Summiert Kostenstände (z. B. für die Projektsumme). */
export function kostenstandSumme(liste: Kostenstand[]): Kostenstand {
  const felder = ["geschaetzt", "vergeben", "nachtraege", "summeVergeben", "berechnet", "bezahlt", "trend", "abweichung"] as const;
  return Object.fromEntries(felder.map((k) => [k, liste.reduce((s, x) => s.plus(x[k]), ZERO).toFixed(2)])) as Kostenstand;
}
