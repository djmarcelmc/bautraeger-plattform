import { z } from "zod";
import { datum, dezimal, geld } from "./felder.js";
import { D, cent, money, type Money } from "./money.js";
import { datumPlusTage } from "./verkauf.js";

/**
 * Basiszinssätze nach § 247 BGB (Deutsche Bundesbank), Stand 01.07.2026.
 * Neue Werte (jeweils zum 01.01. und 01.07.) werden in der Anwendung unter „Einstellungen“ nachgetragen.
 */
export const BASISZINSSAETZE_VORBELEGUNG: readonly { gueltigAb: string; satz: string }[] = [
  { gueltigAb: "2015-01-01", satz: "-0.83" },
  { gueltigAb: "2016-07-01", satz: "-0.88" },
  { gueltigAb: "2023-01-01", satz: "1.62" },
  { gueltigAb: "2023-07-01", satz: "3.12" },
  { gueltigAb: "2024-01-01", satz: "3.62" },
  { gueltigAb: "2024-07-01", satz: "3.37" },
  { gueltigAb: "2025-01-01", satz: "2.27" },
  { gueltigAb: "2025-07-01", satz: "1.27" },
  { gueltigAb: "2026-01-01", satz: "1.27" },
  { gueltigAb: "2026-07-01", satz: "1.52" },
];

/** Aufschlag auf den Basiszinssatz: Verbraucher 5 Prozentpunkte (§ 288 Abs. 1 BGB), Unternehmer 9 (§ 288 Abs. 2 BGB). */
export const ZINSAUFSCHLAG = { verbraucher: 5, unternehmer: 9 } as const;

export interface Basiszins {
  gueltigAb: string;
  satz: string | number;
}

export class BasiszinsFehlt extends Error {}

/** Basiszinssatz an einem Tag. */
export function basiszinsAm(tag: string, saetze: readonly Basiszins[]) {
  const gueltig = [...saetze].filter((s) => s.gueltigAb <= tag).sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb)).at(-1);
  if (!gueltig) throw new BasiszinsFehlt(`Für den ${tag.split("-").reverse().join(".")} ist kein Basiszinssatz hinterlegt.`);
  return new D(gueltig.satz);
}

const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(bis) - Date.parse(von)) / 864e5);

export interface Zinsperiode {
  von: string;
  bis: string;
  tage: number;
  kapital: string;
  zinssatz: string;
  zinsen: string;
}

/**
 * Verzugszinsen tagesgenau (act/365): von `verzugAb` bis einschließlich `bis`.
 * Teilzahlungen mindern das Kapital ab ihrem Eingangstag; Wechsel des Basiszinssatzes werden berücksichtigt.
 * Mit `festerZinssatz` (z. B. vertraglich vereinbart) wird statt Basiszins + Aufschlag dieser Satz verwendet.
 */
export function verzugszinsen(e: {
  betrag: Money;
  verzugAb: string;
  bis: string;
  zahlungen?: { datum: string; betrag: string | Money }[];
  basiszinsen: readonly Basiszins[];
  aufschlag?: number;
  festerZinssatz?: string | number | null;
}): { zinsen: Money; perioden: Zinsperiode[] } {
  if (e.bis < e.verzugAb) return { zinsen: money(0), perioden: [] };
  const ende = datumPlusTage(e.bis, 1); // exklusiv
  const zahlungen = (e.zahlungen ?? []).filter((z) => z.datum < ende);
  const grenzen = new Set<string>([e.verzugAb, ende]);
  for (const z of zahlungen) if (z.datum > e.verzugAb) grenzen.add(z.datum);
  if (e.festerZinssatz === null || e.festerZinssatz === undefined)
    for (const s of e.basiszinsen) if (s.gueltigAb > e.verzugAb && s.gueltigAb < ende) grenzen.add(s.gueltigAb);
  const punkte = [...grenzen].sort();
  const perioden: Zinsperiode[] = [];
  let summe = new D(0);
  for (let i = 0; i < punkte.length - 1; i++) {
    const von = punkte[i]!;
    const bisExkl = punkte[i + 1]!;
    const bezahlt = zahlungen.filter((z) => z.datum <= von).reduce((s, z) => s.plus(z.betrag), new D(0));
    const kapital = D.max(e.betrag.minus(bezahlt), 0);
    if (kapital.isZero()) continue;
    const satz =
      e.festerZinssatz !== null && e.festerZinssatz !== undefined
        ? new D(e.festerZinssatz)
        : basiszinsAm(von, e.basiszinsen).plus(e.aufschlag ?? ZINSAUFSCHLAG.verbraucher);
    const tage = tageZwischen(von, bisExkl);
    const zinsen = kapital.times(satz).dividedBy(100).times(tage).dividedBy(365);
    summe = summe.plus(zinsen);
    perioden.push({ von, bis: datumPlusTage(bisExkl, -1), tage, kapital: kapital.toFixed(2), zinssatz: satz.toFixed(2), zinsen: cent(zinsen).toFixed(2) });
  }
  return { zinsen: cent(summe), perioden };
}

// ---------------------------------------------------------------- Mahnstufen

export const MAHNSTUFEN = [
  { stufe: 1, titel: "Zahlungserinnerung", fristTage: 7 },
  { stufe: 2, titel: "Mahnung", fristTage: 7 },
  { stufe: 3, titel: "Letzte Mahnung", fristTage: 7 },
] as const;

/** Tage nach Fälligkeit, bevor erstmals erinnert wird. */
export const KARENZ_TAGE = 3;

export interface Mahnvorschlag {
  stufe: number | null;
  hinweis?: string;
}

/** Schlägt die nächste Mahnstufe für eine Zahlungsanforderung zum Stichtag vor. */
export function mahnvorschlag(
  a: { faelligAm: string; offen: Money; mahnstufe: number; letzteFristBis: string | null; mahnsperre: boolean },
  stichtag: string,
  karenzTage = KARENZ_TAGE,
): Mahnvorschlag {
  if (!a.offen.gt(0)) return { stufe: null };
  if (a.mahnsperre) return { stufe: null, hinweis: "Mahnsperre im Kaufvertrag" };
  if (a.mahnstufe === 0) return datumPlusTage(a.faelligAm, karenzTage) < stichtag ? { stufe: 1 } : { stufe: null };
  if (a.letzteFristBis && a.letzteFristBis >= stichtag) return { stufe: null, hinweis: "Mahnfrist läuft noch" };
  if (a.mahnstufe >= MAHNSTUFEN.length) return { stufe: null, hinweis: "Letzte Mahnung erfolglos – rechtliche Schritte prüfen" };
  return { stufe: a.mahnstufe + 1 };
}

// ---------------------------------------------------------------- Eingaben

export const MahnlaufEingabe = z.object({
  zahlungsanforderungIds: z.array(z.uuid()).min(1, "Mindestens eine Zahlungsanforderung wählen"),
  datum: datum().refine((d) => !!d, "Mahndatum angeben"),
  mahngebuehr: geld(),
});
export type MahnlaufEingabe = z.infer<typeof MahnlaufEingabe>;

export const BasiszinsEingabe = z.object({
  gueltigAb: datum().refine((d) => !!d && (d.endsWith("-01-01") || d.endsWith("-07-01")), "Der Basiszinssatz gilt jeweils ab 01.01. oder 01.07."),
  satz: dezimal(2).refine((v) => v !== null && v !== undefined && Math.abs(Number(v)) < 20, "Satz in Prozent angeben"),
});
