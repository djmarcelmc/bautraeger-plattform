import { z } from "zod";
import { money, summe } from "./money.js";

// Buchungsjournal: wird aus Verkauf (Zahlungsanforderungen, Zahlungseingänge) und Kosten (freigegebene Rechnungen,
// Zahlungsausgänge, abgeführte Bauabzugsteuer) abgeleitet und ist Quelle des DATEV-Exports. Bereits exportierte
// Buchungen werden nie verändert: Ändert sich die Quelle, entsteht eine Stornobuchung und eine neue Buchung.
//
// Kontierung je Gesellschaft. Die Standardkonten sind ein Vorschlag (Anzahlungsmethode: Zahlungsanforderungen auf
// „Erhaltene Anzahlungen“, mit der Übergabe Umbuchung auf Erlöse, danach Anforderungen direkt auf Erlöse; Bauleistungen als Fremdleistungen ohne Vorsteuer, da Bauträgerumsätze nach § 4 Nr. 9a UStG
// steuerfrei sind) und müssen mit dem Steuerberater abgestimmt werden.

const konto = (name: string) => z.string().trim().regex(/^\d{4,9}$/, `${name}: 4 bis 9 Ziffern`);
const buSchluessel = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .regex(/^(\d{1,4})?$/, "BU-Schlüssel: bis zu 4 Ziffern")
    .transform((s) => s || null),
);

export const KontierungEingabe = z.object({
  bank: konto("Bankkonto"),
  anzahlungen: konto("Erhaltene Anzahlungen / Erlöse"),
  anzahlungenBu: buSchluessel,
  erloese: konto("Erlöse"),
  erloeseBu: buSchluessel,
  bauleistungen: konto("Bauleistungen"),
  bauleistungenBu: buSchluessel,
  skonto: konto("Erhaltene Skonti"),
  bauabzug: konto("Verbindlichkeit Bauabzugsteuer"),
  debitorBasis: z.coerce.number("Zahl angeben").int().min(10000).max(99999999),
  kreditorBasis: z.coerce.number("Zahl angeben").int().min(10000).max(99999999),
});
export type Kontierung = z.infer<typeof KontierungEingabe>;

export const KONTIERUNG_STANDARD: Record<"03" | "04", Kontierung> = {
  "03": { bank: "1200", anzahlungen: "1710", anzahlungenBu: null, erloese: "8100", erloeseBu: null, bauleistungen: "3100", bauleistungenBu: null, skonto: "3730", bauabzug: "1736", debitorBasis: 10000, kreditorBasis: 70000 },
  "04": { bank: "1800", anzahlungen: "3250", anzahlungenBu: null, erloese: "4100", erloeseBu: null, bauleistungen: "5900", bauleistungenBu: null, skonto: "5730", bauabzug: "3700", debitorBasis: 10000, kreditorBasis: 70000 },
};

/** Gespeicherte Kontierung oder Standard des Kontenrahmens; Personenkontenbasis passend zur Sachkontenlänge. */
export function kontierungFuer(g: { skr?: string | null; sachkontenlaenge?: number | null; kontierung?: unknown }): Kontierung {
  const std = KONTIERUNG_STANDARD[g.skr === "04" ? "04" : "03"];
  const faktor = 10 ** Math.max(0, (g.sachkontenlaenge ?? 4) - 4);
  const standard = { ...std, debitorBasis: std.debitorBasis * faktor, kreditorBasis: std.kreditorBasis * faktor };
  // gespeicherte Zuordnung aus älteren Versionen um neue Konten ergänzen
  const gespeichert = g.kontierung && typeof g.kontierung === "object" ? KontierungEingabe.safeParse({ ...standard, ...g.kontierung }) : null;
  return gespeichert?.success ? gespeichert.data : standard;
}

/**
 * Personenkonto eines Geschäftspartners: Hat die Partnernummer bereits die Länge eines Personenkontos
 * (Sachkontenlänge + 1, z. B. 70001), wird sie übernommen, sonst Basis + Partnernummer (10000 + 17 = 10017).
 */
export function personenkonto(nr: number, basis: number): string {
  return String(nr).length === String(basis).length ? String(nr) : String(basis + nr);
}

/** Belegfeld 1 erlaubt bei DATEV nur Ziffern, Buchstaben und $ & % * + - / (max. 36 Zeichen). */
export const belegnummer = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9$&%*+\-/]/g, "").slice(0, 36) || null;

export const QUELLEN = {
  zahlungsanforderung: "Zahlungsanforderung",
  zahlungseingang: "Zahlungseingang",
  uebergabe: "Übergabe (Umbuchung auf Erlöse)",
  eingangsrechnung: "Eingangsrechnung",
  zahlungsausgang: "Zahlungsausgang",
  "zahlungsausgang.skonto": "Skonto",
  "zahlungsausgang.bauabzug": "Bauabzugsteuer einbehalten",
  bauabzug_abfuehrung: "Bauabzugsteuer abgeführt",
} as const;
export type QuelleTyp = keyof typeof QUELLEN;

export interface JournalPosten {
  quelleTyp: QuelleTyp;
  quelleId: string;
  belegdatum: string;
  belegnr: string | null;
  /** Sollkonto */
  konto: string;
  /** Habenkonto */
  gegenkonto: string;
  /** immer positiv */
  betrag: string;
  sollHaben: "S" | "H";
  steuerschluessel: string | null;
  buchungstext: string;
  kostenstelle: string | null;
}

export interface JournalQuellen {
  anforderungen: { id: string; kaufvertragId: string; rechnungsnr: string; angefordertAm: string; betrag: string; debitorNr: number; name: string; kostenstelle: string | null }[];
  /** Kaufverträge mit Übergabe (Besitzübergang = Gewinnrealisierung) */
  uebergaben: { kaufvertragId: string; datum: string; vertragNr: string; name: string; kostenstelle: string | null }[];
  eingaenge: { id: string; datum: string; betrag: string; debitorNr: number; name: string; rechnungsnr: string | null; kostenstelle: string | null }[];
  /** Freigegebene oder bezahlte Rechnungen; Betrag = geprüft fällig (nach Nachlass, Umlagen und Einbehalt, vor Skonto). */
  rechnungen: { id: string; rechnungsnr: string; rechnungsdatum: string; betrag: string; kreditorNr: number; name: string; kostenstelle: string | null }[];
  ausgaenge: { id: string; datum: string; betrag: string; skonto: string; bauabzugsteuer: string; kreditorNr: number; name: string; rechnungsnr: string; kostenstelle: string | null }[];
  abfuehrungen: { id: string; abgefuehrtAm: string; abzugsbetrag: string; monat: string; name: string }[];
}

const text60 = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

/** Soll-Stand des Journals aus den Quellen (Betrag 0 entfällt; negative Beträge tauschen Soll und Haben). */
export function journalSoll(q: JournalQuellen, k: Kontierung): JournalPosten[] {
  const liste: JournalPosten[] = [];
  const add = (p: Omit<JournalPosten, "betrag" | "sollHaben"> & { betrag: string }) => {
    const b = money(p.betrag);
    if (b.isZero()) return;
    liste.push(b.isNegative() ? { ...p, konto: p.gegenkonto, gegenkonto: p.konto, betrag: b.negated().toFixed(2), sollHaben: "S" } : { ...p, betrag: b.toFixed(2), sollHaben: "S" });
  };
  const deb = (nr: number) => personenkonto(nr, k.debitorBasis);
  const kred = (nr: number) => personenkonto(nr, k.kreditorBasis);
  const uebergabe = new Map(q.uebergaben.map((u) => [u.kaufvertragId, u]));
  for (const a of q.anforderungen) {
    // nach der Übergabe direkt auf Erlöse, vorher auf Erhaltene Anzahlungen
    const nachUebergabe = (uebergabe.get(a.kaufvertragId)?.datum ?? "9999") < a.angefordertAm;
    add({ quelleTyp: "zahlungsanforderung", quelleId: a.id, belegdatum: a.angefordertAm, belegnr: belegnummer(a.rechnungsnr), konto: deb(a.debitorNr), gegenkonto: nachUebergabe ? k.erloese : k.anzahlungen, betrag: a.betrag, steuerschluessel: nachUebergabe ? k.erloeseBu : k.anzahlungenBu, buchungstext: text60(`Zahlungsanforderung ${a.name}`), kostenstelle: a.kostenstelle });
  }
  for (const u of q.uebergaben) {
    const bisher = summe(q.anforderungen.filter((a) => a.kaufvertragId === u.kaufvertragId && a.angefordertAm <= u.datum).map((a) => money(a.betrag)));
    add({ quelleTyp: "uebergabe", quelleId: u.kaufvertragId, belegdatum: u.datum, belegnr: belegnummer(u.vertragNr), konto: k.anzahlungen, gegenkonto: k.erloese, betrag: bisher.toFixed(2), steuerschluessel: k.erloeseBu, buchungstext: text60(`Übergabe ${u.vertragNr} ${u.name}`), kostenstelle: u.kostenstelle });
  }
  for (const e of q.eingaenge)
    add({ quelleTyp: "zahlungseingang", quelleId: e.id, belegdatum: e.datum, belegnr: belegnummer(e.rechnungsnr), konto: k.bank, gegenkonto: deb(e.debitorNr), betrag: e.betrag, steuerschluessel: null, buchungstext: text60(`Zahlung ${e.name}`), kostenstelle: e.kostenstelle });
  for (const r of q.rechnungen)
    add({ quelleTyp: "eingangsrechnung", quelleId: r.id, belegdatum: r.rechnungsdatum, belegnr: belegnummer(r.rechnungsnr), konto: k.bauleistungen, gegenkonto: kred(r.kreditorNr), betrag: r.betrag, steuerschluessel: k.bauleistungenBu, buchungstext: text60(`Rechnung ${r.name}`), kostenstelle: r.kostenstelle });
  for (const z of q.ausgaenge) {
    const basis = { quelleId: z.id, belegdatum: z.datum, belegnr: belegnummer(z.rechnungsnr), konto: kred(z.kreditorNr), steuerschluessel: null, kostenstelle: z.kostenstelle };
    add({ ...basis, quelleTyp: "zahlungsausgang", gegenkonto: k.bank, betrag: z.betrag, buchungstext: text60(`Zahlung ${z.name}`) });
    add({ ...basis, quelleTyp: "zahlungsausgang.skonto", gegenkonto: k.skonto, betrag: z.skonto, buchungstext: text60(`Skonto ${z.name}`) });
    add({ ...basis, quelleTyp: "zahlungsausgang.bauabzug", gegenkonto: k.bauabzug, betrag: z.bauabzugsteuer, buchungstext: text60(`Bauabzugsteuer ${z.name}`) });
  }
  for (const a of q.abfuehrungen)
    add({ quelleTyp: "bauabzug_abfuehrung", quelleId: a.id, belegdatum: a.abgefuehrtAm, belegnr: belegnummer(`BAU-${a.monat}`), konto: k.bauabzug, gegenkonto: k.bank, betrag: a.abzugsbetrag, steuerschluessel: null, buchungstext: text60(`Bauabzugsteuer ${a.monat} ${a.name}`), kostenstelle: null });
  return liste;
}

export interface JournalIst extends JournalPosten {
  id: string;
  exportiertAm: string | Date | null;
  stornoVon: string | null;
}

const FELDER = ["belegdatum", "belegnr", "konto", "gegenkonto", "betrag", "sollHaben", "steuerschluessel", "buchungstext", "kostenstelle"] as const;
const gleich = (a: JournalPosten, b: JournalPosten) => FELDER.every((f) => (f === "betrag" ? money(a.betrag).eq(b.betrag) : (a[f] ?? null) === (b[f] ?? null)));
const schluessel = (p: { quelleTyp: string; quelleId: string }) => `${p.quelleTyp}|${p.quelleId}`;

/**
 * Abgleich Soll ↔ gespeichertes Journal. Nicht exportierte Buchungen werden angepasst oder gelöscht; exportierte
 * bleiben unverändert und werden bei Abweichung storniert (Gegenbuchung mit Haben-Kennzeichen zum Stichtag,
 * frühestens zum ursprünglichen Belegdatum), danach wird neu gebucht.
 */
export function journalAbgleich(soll: JournalPosten[], ist: JournalIst[], stichtag: string) {
  const storniert = new Set(ist.filter((b) => b.stornoVon).map((b) => b.stornoVon!));
  const aktiv = new Map(ist.filter((b) => !b.stornoVon && !storniert.has(b.id)).map((b) => [schluessel(b), b]));
  const neu: (JournalPosten & { stornoVon?: string })[] = [];
  const aendern: { id: string; werte: JournalPosten }[] = [];
  const loeschen: string[] = [];
  const storno = (b: JournalIst) =>
    neu.push({
      ...Object.fromEntries([...FELDER, "quelleTyp", "quelleId"].map((f) => [f, b[f as keyof JournalPosten]])),
      sollHaben: "H",
      belegdatum: stichtag > b.belegdatum ? stichtag : b.belegdatum,
      buchungstext: text60(`Storno ${b.buchungstext}`),
      stornoVon: b.id,
    } as JournalPosten & { stornoVon: string });
  const gesehen = new Set<string>();
  for (const p of soll) {
    const k = schluessel(p);
    gesehen.add(k);
    const b = aktiv.get(k);
    if (!b) neu.push(p);
    else if (gleich(p, b)) continue;
    else if (b.exportiertAm) {
      storno(b);
      neu.push(p);
    } else aendern.push({ id: b.id, werte: p });
  }
  for (const [k, b] of aktiv) {
    if (gesehen.has(k)) continue;
    if (b.exportiertAm) storno(b);
    else loeschen.push(b.id);
  }
  return { neu, aendern, loeschen, stornos: neu.filter((n) => n.stornoVon).length };
}

export const DatevExportEingabe = z
  .object({
    gesellschaftId: z.uuid("Gesellschaft wählen"),
    von: z.iso.date("Datum von angeben"),
    bis: z.iso.date("Datum bis angeben"),
    nurNeue: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(true),
  })
  .refine((e) => e.bis >= e.von, { message: "Bis liegt vor Von", path: ["bis"] })
  .refine((e) => e.von.slice(0, 4) === e.bis.slice(0, 4), { message: "Ein DATEV-Stapel darf nur ein Wirtschaftsjahr umfassen", path: ["bis"] });
