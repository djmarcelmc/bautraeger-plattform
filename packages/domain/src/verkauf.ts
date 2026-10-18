import { z } from "zod";
import { datum, dezimal, ganzzahl, geld, leerAlsUndefiniert, text } from "./felder.js";
import { MABV_ABSCHNITTE, ratenplanPruefen, type MabvAbschnitt } from "./mabv.js";
import { D, money, summe, type Money } from "./money.js";

const abschnittKeys = MABV_ABSCHNITTE.map((a) => a.key) as [MabvAbschnitt, ...MabvAbschnitt[]];
export const MabvAbschnittSchema = z.enum(abschnittKeys);

// ---------------------------------------------------------------- Eingaben

const RateVorlageSchema = z.object({
  bezeichnung: z.string().trim().max(300).optional(),
  abschnitte: z.array(MabvAbschnittSchema).min(1),
});

/** Voraussetzungen und Konditionen – jederzeit änderbar, auch nach Anforderungen. */
export const KaufvertragKonditionen = z.object({
  urkundennr: text(50),
  datum: datum(),
  zahlungsanforderungAn: z.uuid("Rechnungsempfänger wählen"),
  vertragWirksam: z.boolean().default(false),
  vormerkungEingetragenAm: datum(),
  lastenfreistellungGesichert: z.boolean().default(false),
  buergschaftNach7: z.boolean().default(false),
  zahlungszielTage: leerAlsUndefiniert(ganzzahl().min(0).max(90).default(10)),
  verbraucher: z.boolean().default(true),
  verzugszinsProzent: dezimal(4),
  anforderungssperre: z.boolean().default(false),
  mahnsperre: z.boolean().default(false),
});
export type KaufvertragKonditionen = z.infer<typeof KaufvertragKonditionen>;

export const KaufvertragEingabe = KaufvertragKonditionen.extend({
  projektId: z.uuid(),
  erbbaurecht: z.boolean().default(false),
  kaeufer: z
    .array(z.object({ partnerId: z.uuid(), anteilProzent: dezimal(4).default("100") }))
    .min(1, "Mindestens einen Käufer angeben"),
  einheiten: z
    .array(z.object({ einheitId: z.uuid(), vkBrutto: geld() }))
    .min(1, "Mindestens eine Einheit angeben"),
  /** Ohne Angabe: Standardplan mit 7 Raten. */
  raten: z.array(RateVorlageSchema).optional(),
})
  .superRefine((v, ctx) => {
    const anteile = summe(v.kaeufer.map((k) => money(k.anteilProzent ?? "0")));
    if (!anteile.equals(100)) ctx.addIssue({ code: "custom", path: ["kaeufer"], message: `Käuferanteile ergeben ${anteile.toFixed(2)} % statt 100 %` });
    if (new Set(v.kaeufer.map((k) => k.partnerId)).size !== v.kaeufer.length)
      ctx.addIssue({ code: "custom", path: ["kaeufer"], message: "Ein Käufer ist doppelt angegeben" });
    if (new Set(v.einheiten.map((e) => e.einheitId)).size !== v.einheiten.length)
      ctx.addIssue({ code: "custom", path: ["einheiten"], message: "Eine Einheit ist doppelt angegeben" });
    if (v.einheiten.some((e) => !e.vkBrutto || money(e.vkBrutto).lte(0)))
      ctx.addIssue({ code: "custom", path: ["einheiten"], message: "Jede Einheit braucht einen Verkaufspreis > 0" });
    if (v.raten) for (const f of ratenplanPruefen(v.raten)) ctx.addIssue({ code: "custom", path: ["raten"], message: f });
  });
export type KaufvertragEingabe = z.infer<typeof KaufvertragEingabe>;

export const BautenstandMeldung = z.object({
  einheitIds: z.array(z.uuid()).min(1, "Mindestens eine Einheit wählen"),
  abschnitt: MabvAbschnittSchema,
  fertigAm: datum().refine((d) => !!d, "Datum angeben"),
});
export type BautenstandMeldung = z.infer<typeof BautenstandMeldung>;

export const ZahlungsanforderungEingabe = z.object({
  rateIds: z.array(z.uuid()).min(1, "Mindestens eine Rate wählen"),
  datum: datum().refine((d) => !!d, "Datum angeben"),
});
export type ZahlungsanforderungEingabe = z.infer<typeof ZahlungsanforderungEingabe>;

export const ZahlungseingangEingabe = z.object({
  zahlungsanforderungId: z.uuid(),
  datum: datum().refine((d) => !!d, "Datum angeben"),
  betrag: geld().refine((b) => !!b && money(b).gt(0), "Betrag > 0 angeben"),
  verwendungszweck: text(300),
});
export type ZahlungseingangEingabe = z.infer<typeof ZahlungseingangEingabe>;

// ---------------------------------------------------------------- Logik

/**
 * Welche MaBV-Abschnitte gelten für einen Vertrag als fertig?
 * Maßgeblich sind die Wohn-/Gewerbeeinheiten des Vertrags (Stellplätze laufen mit);
 * enthält der Vertrag nur Stellplätze, zählen diese. Ein Abschnitt ist fertig, wenn er
 * für alle maßgeblichen Einheiten gemeldet ist.
 */
export function fertigeAbschnitteFuerVertrag(
  einheiten: { id: string; typ: string }[],
  meldungen: { einheitId: string; abschnitt: string }[],
): Set<MabvAbschnitt> {
  const ohneStellplatz = einheiten.filter((e) => e.typ !== "stellplatz");
  const relevant = (ohneStellplatz.length ? ohneStellplatz : einheiten).map((e) => e.id);
  const fertig = new Set<MabvAbschnitt>();
  if (!relevant.length) return fertig;
  for (const a of abschnittKeys)
    if (relevant.every((id) => meldungen.some((m) => m.einheitId === id && m.abschnitt === a))) fertig.add(a);
  return fertig;
}

export type RatenStatus = "offen" | "anforderbar" | "gesperrt" | "angefordert" | "teilbezahlt" | "bezahlt";

export const RATEN_STATUS_TEXT: Record<RatenStatus, string> = {
  offen: "Bauabschnitt offen",
  anforderbar: "anforderbar",
  gesperrt: "Voraussetzung fehlt",
  angefordert: "angefordert",
  teilbezahlt: "teilweise bezahlt",
  bezahlt: "bezahlt",
};

/** Status einer Rate aus Anforderung, Zahlungen und Anforderbarkeit. */
export function ratenStatus(r: {
  angefordert: boolean;
  betrag: Money;
  bezahlt: Money;
  abschnitteFertig: boolean;
  voraussetzungenErfuellt: boolean;
}): RatenStatus {
  if (r.angefordert) {
    if (r.bezahlt.gte(r.betrag)) return "bezahlt";
    return r.bezahlt.gt(0) ? "teilbezahlt" : "angefordert";
  }
  if (!r.abschnitteFertig) return "offen";
  return r.voraussetzungenErfuellt ? "anforderbar" : "gesperrt";
}

/** ISO-Datum + Tage → ISO-Datum (kalendarisch, ohne Zeitzonenfehler). */
export function datumPlusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j!, m! - 1, t! + tage));
  return d.toISOString().slice(0, 10);
}

/** Rechnungsnummer, z. B. ZA-2026-00042. */
export const rechnungsnummer = (praefix: string, jahr: number, lfd: number) =>
  `${praefix}-${jahr}-${String(lfd).padStart(5, "0")}`;

/** Offener Betrag (nie negativ). */
export const offen = (betrag: Money, bezahlt: Money) => D.max(betrag.minus(bezahlt), 0) as Money;
