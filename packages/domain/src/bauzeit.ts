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
    vorgaengerIds: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid("Vorgänger ungültig")).max(20, "Höchstens 20 Vorgänger")),
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
  /** Vorgänger (Index in der Vorlage); der Abstand ergibt sich aus den Vorlageterminen. */
  nach?: number[];
}

/** Typischer Ablauf eines Mehrfamilienhauses (ca. 54 Wochen Bauzeit); je Projekt anpassbar. */
export const STANDARD_BAUZEITENPLAN: readonly VorgangVorlage[] = [
  { bezeichnung: "Grundstückserwerb und Erwerbsnebenkosten", gewerkNrs: [100, 122, 123, 124, 125, 127], abWoche: -12, wochen: 2 },
  { bezeichnung: "Planung, Gutachten, Bauleitung", gewerkNrs: [730, 735, 736, 737, 742, 743, 744, 747, 749, 771], abWoche: -26, wochen: 82 },
  { bezeichnung: "Finanzierung, Versicherung, Vertrieb", gewerkNrs: [761, 787, 788, 791, 792, 794, 795], abWoche: -12, wochen: 68 },
  { bezeichnung: "Herrichten und Erschließung", gewerkNrs: [135, 212, 222, 223, 224, 225, 226, 227, 228, 231, 232, 234, 235, 237], abWoche: -4, wochen: 6 },
  { bezeichnung: "Erdarbeiten, Baugrube", gewerkNrs: [311], mabvAbschnitt: "erdarbeiten", abWoche: 0, wochen: 3, nach: [0] },
  { bezeichnung: "Abdichtung", gewerkNrs: [326], abWoche: 3, wochen: 2, nach: [4] },
  { bezeichnung: "Rohbau", gewerkNrs: [300], abWoche: 3, wochen: 16, nach: [4] },
  { bezeichnung: "Gerüst", gewerkNrs: [392], abWoche: 5, wochen: 32 },
  { bezeichnung: "Zimmerarbeiten", gewerkNrs: [361], mabvAbschnitt: "rohbau", abWoche: 17, wochen: 3, nach: [6] },
  { bezeichnung: "Dachdecker und Flaschner", gewerkNrs: [363, 369], mabvAbschnitt: "dach", abWoche: 20, wochen: 4, nach: [8] },
  { bezeichnung: "Fenster, Rollläden, Garagentor", gewerkNrs: [334, 333], mabvAbschnitt: "fenster", abWoche: 22, wochen: 3, nach: [8] },
  { bezeichnung: "Heizung Rohinstallation", gewerkNrs: [420], mabvAbschnitt: "heizung", abWoche: 24, wochen: 4, nach: [9] },
  { bezeichnung: "Sanitär Rohinstallation", gewerkNrs: [421], mabvAbschnitt: "sanitaer", abWoche: 24, wochen: 4, nach: [9] },
  { bezeichnung: "Elektro Rohinstallation", gewerkNrs: [400], mabvAbschnitt: "elektro", abWoche: 24, wochen: 4, nach: [9] },
  { bezeichnung: "Innenputz", gewerkNrs: [336], mabvAbschnitt: "innenputz", abWoche: 28, wochen: 4, nach: [10, 11, 12, 13] },
  { bezeichnung: "Trockenbau", gewerkNrs: [340], abWoche: 28, wochen: 6, nach: [11, 12, 13] },
  { bezeichnung: "Fassade", gewerkNrs: [335], mabvAbschnitt: "fassade", abWoche: 30, wochen: 6, nach: [10] },
  { bezeichnung: "Estrich", gewerkNrs: [352], mabvAbschnitt: "estrich", abWoche: 32, wochen: 3, nach: [14] },
  { bezeichnung: "Aufzug, Parksystem", gewerkNrs: [461, 463], abWoche: 32, wochen: 10, nach: [6] },
  { bezeichnung: "Fliesen, Treppen, Balkone", gewerkNrs: [355, 350, 351, 353], mabvAbschnitt: "fliesen", abWoche: 36, wochen: 4, nach: [17] },
  { bezeichnung: "Maler, Schlosser", gewerkNrs: [337, 339], abWoche: 40, wochen: 4, nach: [15, 17] },
  { bezeichnung: "Bodenbeläge, Türen", gewerkNrs: [354, 344], abWoche: 42, wochen: 3, nach: [20] },
  { bezeichnung: "Außenanlage", gewerkNrs: [511], abWoche: 42, wochen: 6, nach: [16] },
  { bezeichnung: "Endreinigung, Übergabe Sondereigentum", gewerkNrs: [397], mabvAbschnitt: "bezugsfertigkeit", abWoche: 46, wochen: 1, nach: [19, 21, 22] },
  { bezeichnung: "Restarbeiten, Abnahme Gemeinschaftseigentum", gewerkNrs: [], mabvAbschnitt: "fertigstellung", abWoche: 47, wochen: 7, nach: [23] },
];

export function bauzeitenplanAusVorlage(baubeginn: string, vorlage: readonly VorgangVorlage[] = STANDARD_BAUZEITENPLAN) {
  return vorlage.map((v, i) => {
    const beginn = datumPlusTage(baubeginn, v.abWoche * 7);
    return { nr: (i + 1) * 10, bezeichnung: v.bezeichnung, gewerkNrs: v.gewerkNrs, mabvAbschnitt: v.mabvAbschnitt ?? null, beginn, ende: datumPlusTage(beginn, v.wochen * 7 - 3), nach: v.nach ?? [] };
  });
}

// ---------------------------------------------------------------- Abhängigkeiten (Ende → Anfang)

/** Vorgänger mit Abstand in Tagen zwischen dessen Ende und dem eigenen Beginn (0 = am nächsten Tag; negativ = Überlappung). */
export interface Abhaengigkeit {
  vorgangId: string;
  abstandTage: number;
}

export interface PlanVorgang {
  id: string;
  beginn: string;
  ende: string;
  endeIst: string | null;
  abhaengigkeiten: Abhaengigkeit[];
}

/** Tage zwischen zwei ISO-Daten (b − a). */
export const tageZwischen = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Abstand, bei dem der Nachfolger genau zu seinem jetzigen Beginn passt. */
export const abstandAusTerminen = (vorgaengerEnde: string, beginn: string) => tageZwischen(vorgaengerEnde, beginn) - 1;

/**
 * Mindestabstand für eine neue Abhängigkeit: geplante Überlappung bleibt erhalten (negativ), ebenso ein
 * Wochenende (Ende Freitag → Beginn Montag = 2 Tage). Größere Lücken sind Puffer und kein Pflichtabstand.
 */
export const mindestAbstand = (vorgaengerEnde: string, beginn: string) => {
  const a = abstandAusTerminen(vorgaengerEnde, beginn);
  return a < 0 ? a : Math.min(a, 2);
};

/** Frühester zulässiger Beginn nach allen Vorgängern (null ohne Vorgänger). */
function fruehesterBeginn(v: PlanVorgang, jeId: Map<string, PlanVorgang>) {
  let frueh: string | null = null;
  for (const a of v.abhaengigkeiten) {
    const p = jeId.get(a.vorgangId);
    if (!p) continue;
    const d = datumPlusTage(p.endeIst ?? p.ende, 1 + a.abstandTage);
    if (!frueh || d > frueh) frueh = d;
  }
  return frueh;
}

/** Findet einen Zirkelbezug; liefert die beteiligten IDs oder null. */
export function zirkelbezug(vorgaenge: Pick<PlanVorgang, "id" | "abhaengigkeiten">[]): string[] | null {
  const jeId = new Map(vorgaenge.map((v) => [v.id, v]));
  const zustand = new Map<string, 1 | 2>();
  const pfad: string[] = [];
  const besuche = (id: string): string[] | null => {
    if (zustand.get(id) === 2) return null;
    if (zustand.get(id) === 1) return pfad.slice(pfad.indexOf(id));
    zustand.set(id, 1);
    pfad.push(id);
    for (const a of jeId.get(id)?.abhaengigkeiten ?? []) {
      if (!jeId.has(a.vorgangId)) continue;
      const z = besuche(a.vorgangId);
      if (z) return z;
    }
    pfad.pop();
    zustand.set(id, 2);
    return null;
  };
  for (const v of vorgaenge) {
    const z = besuche(v.id);
    if (z) return z;
  }
  return null;
}

/**
 * Schiebt Nachfolger nach hinten, wenn ein Vorgänger später endet (Dauer bleibt erhalten).
 * Erledigte Vorgänge (Ist-Ende) werden nicht verschoben. Nach vorne wird nichts gezogen.
 */
export function nachfolgerAnpassen(vorgaenge: PlanVorgang[], geaendert: string[]) {
  const jeId = new Map(vorgaenge.map((v) => [v.id, { ...v }]));
  const nachfolger = new Map<string, string[]>();
  for (const v of vorgaenge) for (const a of v.abhaengigkeiten) nachfolger.set(a.vorgangId, [...(nachfolger.get(a.vorgangId) ?? []), v.id]);
  const aenderungen = new Map<string, { id: string; beginn: string; ende: string; tage: number }>();
  const warteschlange = [...geaendert];
  let schritte = 0;
  while (warteschlange.length && schritte++ < 10_000) {
    const id = warteschlange.shift()!;
    for (const sid of nachfolger.get(id) ?? []) {
      const s = jeId.get(sid)!;
      if (s.endeIst) continue;
      const frueh = fruehesterBeginn(s, jeId);
      if (!frueh || frueh <= s.beginn) continue;
      const tage = tageZwischen(s.beginn, frueh);
      s.beginn = frueh;
      s.ende = datumPlusTage(s.ende, tage);
      const bisher = aenderungen.get(sid);
      aenderungen.set(sid, { id: sid, beginn: s.beginn, ende: s.ende, tage: (bisher?.tage ?? 0) + tage });
      warteschlange.push(sid);
    }
  }
  return [...aenderungen.values()];
}

/**
 * Kritischer Pfad: vom Bauende (spätester Vorgang mit Vorgängern, sonst spätester überhaupt) rückwärts über
 * Vorgänger, die ohne Puffer anschließen. Eine Verzögerung dieser Vorgänge verschiebt das Bauende.
 * Begleitende Vorgänge ohne Abhängigkeiten (z. B. Planung, Finanzierung) bestimmen das Bauende nicht.
 */
export function kritischerPfad(vorgaenge: PlanVorgang[]): Set<string> {
  const jeId = new Map(vorgaenge.map((v) => [v.id, v]));
  const ende = (v: PlanVorgang) => v.endeIst ?? v.ende;
  const kritisch = new Set<string>();
  const vernetzt = vorgaenge.filter((v) => v.abhaengigkeiten.length);
  const basis = vernetzt.length ? vernetzt : vorgaenge;
  const letzte = basis.reduce<string | null>((m, v) => (!m || ende(v) > m ? ende(v) : m), null);
  const offen = basis.filter((v) => ende(v) === letzte).map((v) => v.id);
  while (offen.length) {
    const id = offen.pop()!;
    if (kritisch.has(id)) continue;
    kritisch.add(id);
    const v = jeId.get(id)!;
    for (const a of v.abhaengigkeiten) {
      const p = jeId.get(a.vorgangId);
      if (p && datumPlusTage(ende(p), 1 + a.abstandTage) >= v.beginn) offen.push(p.id);
    }
  }
  return kritisch;
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
    if (p.datum === null) ohneTermin[p.richtung] = ohneTermin[p.richtung].plus(b);
    else if (p.datum > letzte) spaeter[p.richtung] = spaeter[p.richtung].plus(b);
    else {
      if (p.datum < erste) ueberfaellig[p.richtung] = ueberfaellig[p.richtung].plus(b);
      const w = p.datum < erste ? wochen[0]! : wochen[Math.floor((Date.parse(p.datum) - Date.parse(erste)) / (7 * 86_400_000))]!;
      arten[p.richtung].add(p.art);
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

// ---------------------------------------------------------------- Abfluss eines Handwerkervertrags

export interface VertragsLiquiditaet {
  /** Auftragssumme inkl. beauftragter Nachträge (brutto, vor Nachlass) */
  summeVergeben: string;
  /** Zuletzt geprüfter kumulierter Rechnungsstand */
  berechnet: string;
  /** Auszahlungen + Skonto + Bauabzugsteuer */
  abgegolten: string;
  nachlassProzent?: number;
  umlagenProzent?: number;
  einbehaltVertragserfuellungProzent?: number;
  einbehaltGewaehrleistungProzent?: number;
  skontoProzent?: number;
  /** Planannahme: Skonto wird gezogen (nur wenn der Vertrag Skonto vorsieht) */
  skontoNutzen?: boolean;
  /** Vertragserfüllungs-/Gewährleistungsbürgschaft liegt vor und ersetzt den Einbehalt */
  buergschaftVertragserfuellung?: boolean;
  buergschaftGewaehrleistung?: boolean;
}

/**
 * Teilt die noch zu zahlenden Beträge eines Handwerkervertrags in die Zahlungszeitpunkte auf – nach derselben
 * Prüfkette wie bei der Rechnungsprüfung (Nachlass, Umlagen, Einbehalt, Skonto; Bauabzugsteuer fließt ans Finanzamt
 * und bleibt daher ein Abfluss):
 * - rechnungen: geprüft, aber noch nicht bezahlt
 * - bauleistung: Abschläge auf die noch nicht abgerechnete Leistung (abzüglich Vertragserfüllungseinbehalt)
 * - schlusszahlung: Schlussrechnung nach Abnahme – gibt den Vertragserfüllungseinbehalt bis auf den
 *   Gewährleistungseinbehalt frei
 * - gewaehrleistung: Auszahlung des Gewährleistungseinbehalts nach Ablauf der Gewährleistung (ohne Skonto)
 */
export function vertragsabfluss(v: VertragsLiquiditaet) {
  const p = (x?: number) => money(x ?? 0).dividedBy(100);
  const eins = money(1);
  const ve = v.buergschaftVertragserfuellung ? ZERO : p(v.einbehaltVertragserfuellungProzent);
  const gw = v.buergschaftGewaehrleistung ? ZERO : p(v.einbehaltGewaehrleistungProzent);
  const u = p(v.umlagenProzent);
  const s = v.skontoNutzen === false ? ZERO : p(v.skontoProzent);
  const netto = (x: Money) => x.times(eins.minus(p(v.nachlassProzent)));
  const max = (a: Money, b: Money) => (a.gt(b) ? a : b);
  const nichtNegativ = (x: Money) => max(x, ZERO);
  const berechnet = money(v.berechnet);
  const gesamt = max(money(v.summeVergeben), berechnet);
  const abgegolten = money(v.abgegolten);

  // kumulierte Ansprüche des Handwerkers (vor Skonto) zu den drei Zeitpunkten
  const anspruchJetzt = netto(berechnet).times(eins.minus(u).minus(ve));
  const anspruchAbschlaege = netto(gesamt).times(eins.minus(u).minus(ve));
  const anspruchSchluss = netto(gesamt).times(eins.minus(u).minus(gw));
  const stufen = [
    nichtNegativ(anspruchJetzt.minus(abgegolten)),
    nichtNegativ(anspruchAbschlaege.minus(max(anspruchJetzt, abgegolten))),
    nichtNegativ(anspruchSchluss.minus(max(anspruchAbschlaege, abgegolten))),
  ].map(cent);
  const [rechnungen, bauleistung, schlusszahlung] = stufen.map((x) => cent(x.times(eins.minus(s)))) as [Money, Money, Money];
  return {
    rechnungen,
    bauleistung,
    schlusszahlung,
    gewaehrleistung: cent(netto(gesamt).times(gw)),
    skontoErsparnis: summe(stufen).minus(rechnungen).minus(bauleistung).minus(schlusszahlung),
    /** Derzeit einbehaltener Vertragserfüllungseinbehalt */
    einbehaltenBisher: cent(netto(berechnet).times(ve)),
  };
}
