import { z } from "zod";
import { datum, ganzzahlOptional, pflichttext } from "./felder.js";
import { MABV_ABSCHNITTE, type MabvAbschnitt } from "./mabv.js";
import { cent, money, summe, ZERO, type Money } from "./money.js";
import { datumPlusTage } from "./verkauf.js";

// ---------------------------------------------------------------- Eingaben

const MABV_KEYS = MABV_ABSCHNITTE.map((a) => a.key) as [MabvAbschnitt, ...MabvAbschnitt[]];
const pflichtdatum = (feld: string) => datum().refine((d) => !!d, `${feld} angeben`).transform((d) => d!);

export const VorgangEingabe = z
  .object({
    nr: ganzzahlOptional(1, 9999),
    bezeichnung: pflichttext(120),
    gewerkIds: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid("Gewerk ungültig"))),
    mabvAbschnitt: z.preprocess((v) => (v === "" ? null : v), z.enum(MABV_KEYS, "MaBV-Bauabschnitt ungültig").nullish()),
    beginn: pflichtdatum("Beginn"),
    ende: pflichtdatum("Ende"),
    endeIst: datum(),
  })
  .refine((v) => v.ende >= v.beginn, { path: ["ende"], message: "Ende liegt vor dem Beginn" })
  .refine((v) => !v.endeIst || v.endeIst >= v.beginn, { path: ["endeIst"], message: "Ist-Ende liegt vor dem Beginn" });
export type VorgangEingabe = z.infer<typeof VorgangEingabe>;

export const BauzeitenplanEingabe = z.object({ baubeginn: pflichtdatum("Baubeginn") });
export const VerschiebenEingabe = z.object({
  tage: z.coerce.number().int("Ganze Zahl erwartet").min(-730, "Höchstens 2 Jahre").max(730, "Höchstens 2 Jahre").refine((t) => t !== 0, "Anzahl Tage angeben"),
  abNr: ganzzahlOptional(1, 9999),
});

// ---------------------------------------------------------------- Vorlage

export interface VorgangVorlage {
  bezeichnung: string;
  gewerkNrs: number[];
  mabvAbschnitt?: MabvAbschnitt;
  /** Beginn in Wochen relativ zum Baubeginn (negativ = davor). */
  abWoche: number;
  wochen: number;
}

/** Typischer Ablauf eines Mehrfamilienhauses (ca. 54 Wochen Bauzeit); je Projekt anpassbar. */
export const STANDARD_BAUZEITENPLAN: readonly VorgangVorlage[] = [
  { bezeichnung: "Grundstückserwerb und Erwerbsnebenkosten", gewerkNrs: [100, 122, 123, 124, 125, 127], abWoche: -12, wochen: 2 },
  { bezeichnung: "Planung, Gutachten, Bauleitung", gewerkNrs: [730, 735, 736, 737, 742, 743, 744, 747, 749, 771], abWoche: -26, wochen: 82 },
  { bezeichnung: "Finanzierung, Versicherung, Vertrieb", gewerkNrs: [761, 787, 788, 791, 792, 794, 795], abWoche: -12, wochen: 68 },
  { bezeichnung: "Herrichten und Erschließung", gewerkNrs: [135, 212, 222, 223, 224, 225, 226, 227, 228, 231, 232, 234, 235, 237], abWoche: -4, wochen: 6 },
  { bezeichnung: "Erdarbeiten, Baugrube", gewerkNrs: [311], mabvAbschnitt: "erdarbeiten", abWoche: 0, wochen: 3 },
  { bezeichnung: "Abdichtung", gewerkNrs: [326], abWoche: 3, wochen: 2 },
  { bezeichnung: "Rohbau", gewerkNrs: [300], abWoche: 3, wochen: 16 },
  { bezeichnung: "Gerüst", gewerkNrs: [392], abWoche: 5, wochen: 32 },
  { bezeichnung: "Zimmerarbeiten", gewerkNrs: [361], mabvAbschnitt: "rohbau", abWoche: 17, wochen: 3 },
  { bezeichnung: "Dachdecker und Flaschner", gewerkNrs: [363, 369], mabvAbschnitt: "dach", abWoche: 20, wochen: 4 },
  { bezeichnung: "Fenster, Rollläden, Garagentor", gewerkNrs: [334, 333], mabvAbschnitt: "fenster", abWoche: 22, wochen: 3 },
  { bezeichnung: "Heizung Rohinstallation", gewerkNrs: [420], mabvAbschnitt: "heizung", abWoche: 24, wochen: 4 },
  { bezeichnung: "Sanitär Rohinstallation", gewerkNrs: [421], mabvAbschnitt: "sanitaer", abWoche: 24, wochen: 4 },
  { bezeichnung: "Elektro Rohinstallation", gewerkNrs: [400], mabvAbschnitt: "elektro", abWoche: 24, wochen: 4 },
  { bezeichnung: "Innenputz", gewerkNrs: [336], mabvAbschnitt: "innenputz", abWoche: 28, wochen: 4 },
  { bezeichnung: "Trockenbau", gewerkNrs: [340], abWoche: 28, wochen: 6 },
  { bezeichnung: "Fassade", gewerkNrs: [335], mabvAbschnitt: "fassade", abWoche: 30, wochen: 6 },
  { bezeichnung: "Estrich", gewerkNrs: [352], mabvAbschnitt: "estrich", abWoche: 32, wochen: 3 },
  { bezeichnung: "Aufzug, Parksystem", gewerkNrs: [461, 463], abWoche: 32, wochen: 10 },
  { bezeichnung: "Fliesen, Treppen, Balkone", gewerkNrs: [355, 350, 351, 353], mabvAbschnitt: "fliesen", abWoche: 36, wochen: 4 },
  { bezeichnung: "Maler, Schlosser", gewerkNrs: [337, 339], abWoche: 40, wochen: 4 },
  { bezeichnung: "Bodenbeläge, Türen", gewerkNrs: [354, 344], abWoche: 42, wochen: 3 },
  { bezeichnung: "Außenanlage", gewerkNrs: [511], abWoche: 42, wochen: 6 },
  { bezeichnung: "Endreinigung, Übergabe Sondereigentum", gewerkNrs: [397], mabvAbschnitt: "bezugsfertigkeit", abWoche: 46, wochen: 1 },
  { bezeichnung: "Restarbeiten, Abnahme Gemeinschaftseigentum", gewerkNrs: [], mabvAbschnitt: "fertigstellung", abWoche: 47, wochen: 7 },
];

export function bauzeitenplanAusVorlage(baubeginn: string, vorlage: readonly VorgangVorlage[] = STANDARD_BAUZEITENPLAN) {
  return vorlage.map((v, i) => {
    const beginn = datumPlusTage(baubeginn, v.abWoche * 7);
    return { nr: (i + 1) * 10, bezeichnung: v.bezeichnung, gewerkNrs: v.gewerkNrs, mabvAbschnitt: v.mabvAbschnitt ?? null, beginn, ende: datumPlusTage(beginn, v.wochen * 7 - 3) };
  });
}

/** Ab wann ein MaBV-Abschnitt als erreicht gilt: Erdarbeiten mit Beginn, alle übrigen mit (Ist-)Ende. */
export function meilensteinDatum(v: { mabvAbschnitt: string | null; beginn: string; ende: string; endeIst: string | null }) {
  return v.mabvAbschnitt === "erdarbeiten" ? v.beginn : (v.endeIst ?? v.ende);
}

// ---------------------------------------------------------------- Kalenderwochen

/** Montag der Woche (ISO 8601). */
export function montag(iso: string) {
  const [j, m, t] = iso.split("-").map(Number);
  const wt = (new Date(Date.UTC(j!, m! - 1, t!)).getUTCDay() + 6) % 7;
  return datumPlusTage(iso, -wt);
}

/** Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag ist KW 1). */
export function kalenderwoche(iso: string) {
  const donnerstag = datumPlusTage(montag(iso), 3);
  const jahr = Number(donnerstag.slice(0, 4));
  const tag = (Date.parse(donnerstag) - Date.UTC(jahr, 0, 1)) / 86_400_000;
  return { jahr, woche: Math.floor(tag / 7) + 1 };
}

/** Verteilt einen Betrag centgenau gleichmäßig auf die Wochen von–bis; Vergangenes fällt in die Woche des Stichtags. */
export function verteileWoechentlich(betrag: Money, von: string, bis: string, stichtag: string): { datum: string; betrag: Money }[] {
  if (betrag.isZero()) return [];
  const start = montag(von > stichtag ? von : stichtag);
  const ende = montag(bis > stichtag ? bis : stichtag);
  const wochen: string[] = [];
  for (let d = start; d <= ende; d = datumPlusTage(d, 7)) wochen.push(d);
  const anteil = cent(betrag.dividedBy(wochen.length));
  return wochen.map((d, i) => ({ datum: d, betrag: i === wochen.length - 1 ? betrag.minus(anteil.times(wochen.length - 1)) : anteil }));
}

// ---------------------------------------------------------------- Liquiditätsplan

export type Richtung = "ein" | "aus";
export interface LiquiditaetsPosten {
  richtung: Richtung;
  /** Kategorie, z. B. "angefordert", "raten", "rechnungen", "bauleistung". */
  art: string;
  /** Erwartetes Zahlungsdatum; null = ohne Termin. */
  datum: string | null;
  betrag: Money | string;
}

const leer = () => ({ ein: ZERO, aus: ZERO });
const f = (m: Money) => m.toFixed(2);

/**
 * Wochenweiser Liquiditätsplan ab der Woche des Stichtags.
 * Überfällige Posten fallen in die erste Woche, Posten nach dem Planungszeitraum in „später“.
 */
export function liquiditaetsplan(posten: LiquiditaetsPosten[], opt: { stichtag: string; wochen: number; anfangsbestand?: string }) {
  const erste = montag(opt.stichtag);
  const n = Math.max(1, Math.min(opt.wochen, 260));
  const wochen = Array.from({ length: n }, (_, i) => {
    const von = datumPlusTage(erste, i * 7);
    return { von, bis: datumPlusTage(von, 6), ...kalenderwoche(von), ein: new Map<string, Money>(), aus: new Map<string, Money>() };
  });
  const letzte = wochen[n - 1]!.bis;
  const ueberfaellig = leer();
  const spaeter = leer();
  const ohneTermin = leer();
  const arten = { ein: new Set<string>(), aus: new Set<string>() };
  for (const p of posten) {
    const b = money(p.betrag);
    if (b.isZero()) continue;
    arten[p.richtung].add(p.art);
    if (p.datum === null) ohneTermin[p.richtung] = ohneTermin[p.richtung].plus(b);
    else if (p.datum > letzte) spaeter[p.richtung] = spaeter[p.richtung].plus(b);
    else {
      if (p.datum < erste) ueberfaellig[p.richtung] = ueberfaellig[p.richtung].plus(b);
      const w = p.datum < erste ? wochen[0]! : wochen[Math.floor((Date.parse(p.datum) - Date.parse(erste)) / (7 * 86_400_000))]!;
      const m = w[p.richtung];
      m.set(p.art, (m.get(p.art) ?? ZERO).plus(b));
    }
  }
  let bestand = money(opt.anfangsbestand ?? "0");
  const zeilen = wochen.map((w) => {
    const ein = summe([...w.ein.values()]);
    const aus = summe([...w.aus.values()]);
    bestand = bestand.plus(ein).minus(aus);
    return {
      jahr: w.jahr,
      woche: w.woche,
      von: w.von,
      bis: w.bis,
      ein: Object.fromEntries([...w.ein].map(([k, v]) => [k, f(v)])),
      aus: Object.fromEntries([...w.aus].map(([k, v]) => [k, f(v)])),
      einSumme: f(ein),
      ausSumme: f(aus),
      saldo: f(ein.minus(aus)),
      bestand: f(bestand),
    };
  });
  const bestaende = zeilen.map((z) => money(z.bestand));
  const tiefst = bestaende.reduce((a, b) => (b.lt(a) ? b : a), money(opt.anfangsbestand ?? "0"));
  const tiefstWoche = zeilen.find((z) => money(z.bestand).eq(tiefst));
  const fx = (x: { ein: Money; aus: Money }) => ({ ein: f(x.ein), aus: f(x.aus) });
  return {
    anfangsbestand: f(money(opt.anfangsbestand ?? "0")),
    arten: { ein: [...arten.ein], aus: [...arten.aus] },
    wochen: zeilen,
    summe: { ein: f(summe(zeilen.map((z) => money(z.einSumme)))), aus: f(summe(zeilen.map((z) => money(z.ausSumme)))), endbestand: f(bestand) },
    tiefstand: { bestand: f(tiefst), woche: tiefstWoche ? { jahr: tiefstWoche.jahr, woche: tiefstWoche.woche } : null },
    ueberfaellig: fx(ueberfaellig),
    spaeter: fx(spaeter),
    ohneTermin: fx(ohneTermin),
  };
}
export type Liquiditaetsplan = ReturnType<typeof liquiditaetsplan>;
