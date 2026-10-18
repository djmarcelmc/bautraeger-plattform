import { z } from "zod";
import { datum, geld, pflichttext, text, uuidOptional } from "./felder.js";
import { datumPlusTage } from "./verkauf.js";

export const MANGELARTEN = ["Abnahmemangel", "Gewährleistungsmangel", "Kundenreklamation", "Baumangel (laufende Bauzeit)"] as const;

export const MangelEingabe = z.object({
  projektId: z.uuid("Projekt wählen"),
  einheitId: uuidOptional(),
  gewerkId: uuidOptional(),
  handwerkervertragId: uuidOptional(),
  kaufvertragId: uuidOptional(),
  eigentum: z.enum(["sonder", "gemeinschaft"]).default("sonder"),
  festgestelltAm: datum().refine((d) => !!d, "Datum der Feststellung angeben"),
  festgestelltDurch: text(100),
  titel: pflichttext(200),
  ort: text(200),
  beschreibung: text(4000),
  mangelart: z
    .string()
    .transform((s) => (s === "" ? null : s))
    .pipe(z.enum(MANGELARTEN).nullable())
    .nullish(),
  wertHandwerkerBrutto: geld(),
  wertKundeBrutto: geld(),
  einbehalt: z.boolean().default(false),
  angebotsanforderungAm: datum(),
  auftragserteilungAm: datum(),
  ersatzvornahmeAm: datum(),
});
export type MangelEingabe = z.infer<typeof MangelEingabe>;

export const RuegeEingabe = z
  .object({
    geruegtAm: datum().refine((d) => !!d, "Datum der Rüge angeben"),
    fristBis: datum(),
    bemerkung: text(500),
  })
  .refine((r) => !r.fristBis || !r.geruegtAm || r.fristBis > r.geruegtAm, { message: "Die Frist muss nach dem Rügedatum liegen", path: ["fristBis"] });
export type RuegeEingabe = z.infer<typeof RuegeEingabe>;

export const ErledigtEingabe = z.object({
  erledigtAm: datum().refine((d) => !!d, "Datum angeben"),
  erledigtVon: text(100),
});

/** Übliche Fristen je Rügestufe in Tagen (1. Rüge, 2. Rüge/Nachfrist, 3. Rüge/letzte Frist). */
export const STANDARD_FRIST_TAGE = [14, 10, 7] as const;
export const MAX_RUEGEN = 3;

export type MangelStatus = "neu" | "frist_laeuft" | "ueberfaellig" | "erledigt";
export const MANGEL_STATUS_TEXT: Record<MangelStatus, string> = {
  neu: "noch nicht gerügt",
  frist_laeuft: "Frist läuft",
  ueberfaellig: "Frist überschritten",
  erledigt: "erledigt",
};

/** Status aus Erledigung und letzter Rüge. */
export function mangelStatus(m: { erledigtAm: string | null }, ruegen: { fristBis: string; nachfristBis?: string | null }[], heute: string): MangelStatus {
  if (m.erledigtAm) return "erledigt";
  const letzte = ruegen.at(-1);
  if (!letzte) return "neu";
  return (letzte.nachfristBis ?? letzte.fristBis) < heute ? "ueberfaellig" : "frist_laeuft";
}

/** Nächste Rügestufe mit Vorschlagsfrist – oder null, wenn bereits drei Mal gerügt wurde. */
export function naechsteRuege(anzahlBisher: number, geruegtAm: string) {
  if (anzahlBisher >= MAX_RUEGEN) return null;
  const stufe = anzahlBisher + 1;
  return { stufe, fristBis: datumPlusTage(geruegtAm, STANDARD_FRIST_TAGE[stufe - 1]!) };
}

/** ISO-Datum + Monate (Monatsende wird beachtet: 31.08. + 6 Monate = 28./29.02.). */
export function datumPlusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const ziel = new Date(Date.UTC(j!, m! - 1 + monate, 1));
  const letzterTag = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t!, letzterTag));
  return ziel.toISOString().slice(0, 10);
}

/** Gewährleistungsende aus Abnahme und Frist; null, wenn eines fehlt. */
export function gewaehrleistungBis(abnahmeAm: string | null | undefined, monate: number | null | undefined) {
  if (!abnahmeAm || !monate) return null;
  return datumPlusMonate(abnahmeAm, monate);
}
