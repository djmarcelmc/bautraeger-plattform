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
 * Kostenstand eines Gewerks. Trendkosten: sobald vergeben, zählt die Auftragssumme inkl. beauftragter Nachträge
 * (bzw. der höhere geprüfte Rechnungsstand), sonst die Schätzung. Abweichung = geschätzt − Trend (positiv = Einsparung).
 */
export function kostenstand(geschaetztBrutto: string, vertraege: VertragKosten[]) {
  const geschaetzt = money(geschaetztBrutto);
  const vergeben = summe(vertraege.map((v) => money(v.vertragBrutto)));
  const nachtraege = summe(
    vertraege.flatMap((v) => v.nachtraege.filter((n) => n.status === "beauftragt" || n.status === "abgerechnet").map((n) => money(n.betragBrutto))),
  );
  const angeboten = summe(vertraege.flatMap((v) => v.nachtraege.filter((n) => n.status === "angeboten").map((n) => money(n.betragBrutto))));
  const summeVergeben = vergeben.plus(nachtraege);
  const berechnet = summe(vertraege.map((v) => money(v.berechnet)));
  // Geprüft berechnet über dem Auftrag (z. B. Nachtrag noch nicht beauftragt) → der höhere Stand ist der Trend
  const trend = vertraege.length ? (berechnet.gt(summeVergeben) ? berechnet : summeVergeben) : geschaetzt;
  const f = (m: Money) => m.toFixed(2);
  return {
    geschaetzt: f(geschaetzt),
    vergeben: f(vergeben),
    nachtraege: f(nachtraege),
    summeVergeben: f(summeVergeben),
    berechnet: f(berechnet),
    bezahlt: f(summe(vertraege.map((v) => money(v.abgegolten)))),
    trend: f(trend),
    abweichung: f(geschaetzt.minus(trend)),
    /** Angebotene, noch nicht beauftragte Nachträge (Risiko, nicht im Trend). */
    angeboten: f(angeboten),
  };
}
export type Kostenstand = ReturnType<typeof kostenstand>;

/** Summiert Kostenstände (z. B. für die Projektsumme). */
export function kostenstandSumme(liste: Kostenstand[]): Kostenstand {
  const felder = ["geschaetzt", "vergeben", "nachtraege", "summeVergeben", "berechnet", "bezahlt", "trend", "abweichung", "angeboten"] as const;
  return Object.fromEntries(felder.map((k) => [k, liste.reduce((s, x) => s.plus(x[k]), ZERO).toFixed(2)])) as Kostenstand;
}

export const BUDGET_SCHWELLE_STANDARD = 90;

/** Mandantenweite Einstellungen der Kostenkontrolle. */
export const KostenEinstellung = z.object({
  budgetSchwelleProzent: z.coerce.number().int("Ganze Prozentzahl").min(50, "Mindestens 50 %").max(100, "Höchstens 100 %").default(BUDGET_SCHWELLE_STANDARD),
});
export type KostenEinstellung = z.infer<typeof KostenEinstellung>;

export interface BudgetStand {
  stufe: "ok" | "nahe" | "ueber";
  budget: string;
  /** Gebundene Kosten: Auftrag inkl. beauftragter Nachträge bzw. höher berechneter Stand. */
  gebunden: string;
  angeboten: string;
  ueberschreitung: string;
  auslastungProzent: number | null;
  text: string | null;
}

/**
 * Budgetwarnung je Gewerk: gebundene Kosten (max. aus Auftrag inkl. beauftragter Nachträge und geprüft berechnet)
 * gegen die Schätzung. Ab der Schwelle (Standard 90 %) Hinweis, über 100 % Warnung. Angebotene Nachträge, die das
 * Budget sprengen würden, lösen ebenfalls einen Hinweis aus. Gewerke ohne Vertrag und ohne Rechnung bleiben ruhig.
 */
export function budgetPruefung(stand: Pick<Kostenstand, "geschaetzt" | "summeVergeben" | "berechnet" | "angeboten">, schwelleProzent = BUDGET_SCHWELLE_STANDARD): BudgetStand {
  const budget = money(stand.geschaetzt);
  const vergeben = money(stand.summeVergeben);
  const berechnet = money(stand.berechnet);
  const gebunden = berechnet.gt(vergeben) ? berechnet : vergeben;
  const angeboten = money(stand.angeboten ?? "0");
  const f = (m: Money) => m.toFixed(2);
  const de = (m: Money) => `${m.toNumber().toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
  const ueber = gebunden.minus(budget);
  const auslastung = budget.gt(0) ? Math.round(gebunden.div(budget).toNumber() * 100) : null;
  const basis = { budget: f(budget), gebunden: f(gebunden), angeboten: f(angeboten), ueberschreitung: f(ueber.gt(0) ? ueber : ZERO), auslastungProzent: auslastung };
  if (gebunden.isZero() && angeboten.isZero()) return { ...basis, stufe: "ok", text: null };
  const mitAngebot = angeboten.gt(0) ? gebunden.plus(angeboten) : null;
  const angebotText = mitAngebot && mitAngebot.gt(budget) ? ` Mit den angebotenen Nachträgen (${de(angeboten)}) wären es ${de(mitAngebot)}.` : "";
  if (ueber.gt(0))
    return {
      ...basis,
      stufe: "ueber",
      text: budget.isZero() ? `Kein Budget geschätzt, gebunden sind ${de(gebunden)}.` : `Budget um ${de(ueber)} überschritten (${auslastung} %: ${de(gebunden)} von ${de(budget)}).${angebotText}`,
    };
  if ((auslastung !== null && auslastung >= schwelleProzent) || angebotText)
    return { ...basis, stufe: "nahe", text: `Budget zu ${auslastung} % gebunden (${de(gebunden)} von ${de(budget)}).${angebotText}` };
  return { ...basis, stufe: "ok", text: null };
}

export interface Auftragsrahmen {
  stufe: "ok" | "nahe" | "ueber";
  /** Vertrag + beauftragte/abgerechnete Nachträge */
  auftrag: string;
  /** Angebotene, noch nicht beauftragte Nachträge */
  angeboten: string;
  ueberschreitung: string;
  auslastungProzent: number | null;
  text: string | null;
}

/**
 * Abgleich des kumulierten Rechnungsbetrags mit dem Auftrag (Vertragssumme inkl. beauftragter Nachträge).
 * Ab 90 % Hinweis (außer Schlussrechnung), darüber Warnung – mit Hinweis auf angebotene, noch nicht beauftragte Nachträge.
 */
export function auftragsrahmen(kumuliert: string, vertragBrutto: string, nachtraege: { betragBrutto: string; status: string }[], schlussrechnung = false): Auftragsrahmen {
  const k = money(kumuliert);
  const auftrag = money(vertragBrutto).plus(summe(nachtraege.filter((n) => n.status === "beauftragt" || n.status === "abgerechnet").map((n) => money(n.betragBrutto))));
  const angeboten = summe(nachtraege.filter((n) => n.status === "angeboten").map((n) => money(n.betragBrutto)));
  const f = (m: Money) => m.toFixed(2);
  const de = (m: Money) => `${m.toNumber().toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const ueber = k.minus(auftrag);
  const auslastung = auftrag.gt(0) ? Math.round(k.div(auftrag).toNumber() * 100) : null;
  const basis = { auftrag: f(auftrag), angeboten: f(angeboten), ueberschreitung: f(ueber.gt(0) ? ueber : ZERO), auslastungProzent: auslastung };
  if (ueber.gt(0)) {
    const deckung = angeboten.gt(0)
      ? angeboten.gte(ueber)
        ? ` Angebotene Nachträge über ${de(angeboten)} würden das decken – vor der Freigabe beauftragen.`
        : ` Auch die angebotenen Nachträge (${de(angeboten)}) reichen nicht.`
      : " Es liegt kein Nachtrag vor.";
    const text = auftrag.isZero()
      ? `Für diesen Vertrag ist keine Auftragssumme hinterlegt (Rechnung kumuliert ${de(k)}).`
      : `Rechnung (kumuliert ${de(k)}) übersteigt den Auftrag von ${de(auftrag)} um ${de(ueber)}.${deckung}`;
    return { ...basis, stufe: "ueber", text };
  }
  if (!schlussrechnung && auslastung !== null && auslastung >= 90) return { ...basis, stufe: "nahe", text: `Auftrag zu ${auslastung} % ausgeschöpft (${de(k)} von ${de(auftrag)}).` };
  return { ...basis, stufe: "ok", text: null };
}

// ---------------------------------------------------------------- Budget umschichten

export const BudgetumbuchungEingabe = z
  .object({
    vonGewerkId: z.uuid("Gewerk wählen, von dem umgebucht wird"),
    nachGewerkId: z.uuid("Gewerk wählen, auf das umgebucht wird"),
    betrag: positiv("Betrag"),
    begruendung: pflichttext(500),
  })
  .refine((x) => x.vonGewerkId !== x.nachGewerkId, { message: "Von- und Nach-Gewerk müssen verschieden sein", path: ["nachGewerkId"] });
export type BudgetumbuchungEingabe = z.infer<typeof BudgetumbuchungEingabe>;

/** Freies Budget eines Gewerks: Schätzung − gebundene Kosten (nie negativ). */
export function freiesBudget(stand: Pick<Kostenstand, "geschaetzt" | "summeVergeben" | "berechnet">): Money {
  const vergeben = money(stand.summeVergeben);
  const berechnet = money(stand.berechnet);
  const frei = money(stand.geschaetzt).minus(berechnet.gt(vergeben) ? berechnet : vergeben);
  return frei.gt(0) ? frei : ZERO;
}

export interface UmbuchungsQuelle {
  id: string;
  nr: number;
  bezeichnung: string;
  frei: string;
  /** Vergeben → die Einsparung ist realisiert; sonst wird Budget eines noch offenen Gewerks verbraucht. */
  gesichert: boolean;
}

/**
 * Mögliche Quellen für eine Umbuchung auf `zielId`: Gewerke mit freiem Budget, zuerst vergebene (realisierte
 * Einsparungen), dann noch nicht vergebene; jeweils nach freiem Betrag absteigend.
 */
export function umbuchungsQuellen(gewerke: { id: string; nr: number; bezeichnung: string; stand: Kostenstand; vertraege: unknown[] }[], zielId: string): UmbuchungsQuelle[] {
  return gewerke
    .filter((g) => g.id !== zielId)
    .map((g) => ({ id: g.id, nr: g.nr, bezeichnung: g.bezeichnung, frei: freiesBudget(g.stand), gesichert: g.vertraege.length > 0 }))
    .filter((g) => g.frei.gt(0))
    .sort((a, b) => Number(b.gesichert) - Number(a.gesichert) || b.frei.comparedTo(a.frei) || a.nr - b.nr)
    .map((g) => ({ ...g, frei: g.frei.toFixed(2) }));
}

/** Prüft, ob die Quelle den Betrag hergibt; liefert sonst eine Fehlermeldung. */
export function umbuchungPruefen(quelle: { nr: number; bezeichnung: string; stand: Pick<Kostenstand, "geschaetzt" | "summeVergeben" | "berechnet"> }, betrag: string): string | null {
  const frei = freiesBudget(quelle.stand);
  if (money(betrag).gt(frei))
    return `Gewerk ${quelle.nr} ${quelle.bezeichnung} hat nur ${frei.toNumber().toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € freies Budget (Schätzung abzüglich gebundener Kosten).`;
  return null;
}
