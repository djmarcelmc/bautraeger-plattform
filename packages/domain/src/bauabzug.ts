import { z } from "zod";
import { datum } from "./felder.js";
import { money, summe, type Money } from "./money.js";

// Bauabzugsteuer (§§ 48–48d EStG): Der Leistungsempfänger behält 15 % der Gegenleistung ein, meldet den Betrag bis
// zum 10. des Folgemonats beim Finanzamt des Leistenden an, führt ihn ab und rechnet mit dem Leistenden ab.

/** Anmeldungs- und Zahlungstermin: 10. des Folgemonats; fällt er auf ein Wochenende, der nächste Montag (§ 108 Abs. 3 AO). */
export function bauabzugFrist(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j!, m!, 10));
  const tag = d.getUTCDay();
  if (tag === 6) d.setUTCDate(12);
  if (tag === 0) d.setUTCDate(11);
  return d.toISOString().slice(0, 10);
}

export const monatText = (monat: string) =>
  new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export interface BauabzugZahlung {
  gesellschaftId: string;
  handwerkerId: string;
  datum: string;
  /** Ausgezahlter Betrag (ohne Bauabzugsteuer) */
  betrag: string;
  bauabzugsteuer: string;
  rechnungsnr?: string;
  rechnungsdatum?: string;
}

export interface BauabzugAnmeldungStand {
  id: string;
  gesellschaftId: string;
  handwerkerId: string;
  monat: string;
  gegenleistung: string;
  abzugsbetrag: string;
  angemeldetAm: string;
  abgefuehrtAm: string | null;
}

export type BauabzugStatus = "offen" | "angemeldet" | "abgefuehrt" | "abweichung";

/**
 * Monatsübersicht: je Gesellschaft (Leistungsempfänger) und Handwerker (Leistender) die Gegenleistung
 * (Auszahlung + Abzugsbetrag, also brutto nach Skonto) und der Abzugsbetrag, mit Stand der Anmeldung.
 * „abweichung“: nach der Anmeldung kamen Zahlungen hinzu oder fielen weg – Anmeldung berichtigen.
 */
export function bauabzugUebersicht(zahlungen: BauabzugZahlung[], anmeldungen: BauabzugAnmeldungStand[], stichtag: string) {
  type Gruppe = { gesellschaftId: string; handwerkerId: string; monat: string; zahlungen: BauabzugZahlung[] };
  const gruppen = new Map<string, Gruppe>();
  const schluessel = (g: string, h: string, m: string) => `${g}|${h}|${m}`;
  for (const z of zahlungen) {
    if (!money(z.bauabzugsteuer).gt(0)) continue;
    const monat = z.datum.slice(0, 7);
    const k = schluessel(z.gesellschaftId, z.handwerkerId, monat);
    if (!gruppen.has(k)) gruppen.set(k, { gesellschaftId: z.gesellschaftId, handwerkerId: z.handwerkerId, monat, zahlungen: [] });
    gruppen.get(k)!.zahlungen.push(z);
  }
  // Anmeldungen ohne (noch vorhandene) Zahlungen trotzdem zeigen
  for (const a of anmeldungen) {
    const k = schluessel(a.gesellschaftId, a.handwerkerId, a.monat);
    if (!gruppen.has(k)) gruppen.set(k, { gesellschaftId: a.gesellschaftId, handwerkerId: a.handwerkerId, monat: a.monat, zahlungen: [] });
  }
  const f = (m: Money) => m.toFixed(2);
  const zeilen = [...gruppen.values()].map((g) => {
    const abzug = summe(g.zahlungen.map((z) => money(z.bauabzugsteuer)));
    const gegenleistung = summe(g.zahlungen.map((z) => money(z.betrag).plus(z.bauabzugsteuer)));
    const anmeldung = anmeldungen.find((a) => a.gesellschaftId === g.gesellschaftId && a.handwerkerId === g.handwerkerId && a.monat === g.monat) ?? null;
    const status: BauabzugStatus = !anmeldung
      ? "offen"
      : !money(anmeldung.abzugsbetrag).eq(abzug)
        ? "abweichung"
        : anmeldung.abgefuehrtAm
          ? "abgefuehrt"
          : "angemeldet";
    return {
      gesellschaftId: g.gesellschaftId,
      handwerkerId: g.handwerkerId,
      monat: g.monat,
      gegenleistung: f(gegenleistung),
      abzugsbetrag: f(abzug),
      zahlungen: [...g.zahlungen].sort((a, b) => a.datum.localeCompare(b.datum)),
      anmeldung,
      status,
    };
  });
  const monate = [...new Set(zeilen.map((z) => z.monat))].sort().reverse();
  return monate.map((monat) => {
    const eigene = zeilen.filter((z) => z.monat === monat);
    const faelligAm = bauabzugFrist(monat);
    const offen = eigene.filter((z) => z.status === "offen" || z.status === "abweichung").length;
    const nichtAbgefuehrt = eigene.filter((z) => z.status !== "abgefuehrt").length;
    return {
      monat,
      monatText: monatText(monat),
      faelligAm,
      ueberfaellig: nichtAbgefuehrt > 0 && faelligAm < stichtag,
      offen,
      nichtAbgefuehrt,
      summe: { gegenleistung: f(summe(eigene.map((z) => money(z.gegenleistung)))), abzugsbetrag: f(summe(eigene.map((z) => money(z.abzugsbetrag)))) },
      zeilen: eigene,
    };
  });
}
export type BauabzugMonat = ReturnType<typeof bauabzugUebersicht>[number];

export const BauabzugAnmeldungEingabe = z
  .object({
    gesellschaftId: z.uuid("Gesellschaft fehlt"),
    handwerkerId: z.uuid("Handwerker fehlt"),
    monat: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM"),
    angemeldetAm: datum().refine((d) => !!d, "Datum der Anmeldung angeben"),
    abgefuehrtAm: datum(),
    bemerkung: z.string().trim().max(500).optional(),
  })
  .refine((a) => !a.abgefuehrtAm || !a.angemeldetAm || a.abgefuehrtAm >= `${a.monat}-01`, { message: "Abführung kann nicht vor dem Anmeldungszeitraum liegen", path: ["abgefuehrtAm"] });
export type BauabzugAnmeldungEingabe = z.infer<typeof BauabzugAnmeldungEingabe>;
