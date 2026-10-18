import { z } from "zod";
import { datum, geld, pflichttext, text, uuidOptional } from "./felder.js";
import { MABV_ABSCHNITTE, type MabvAbschnitt } from "./mabv.js";
import { money, summe, type Money } from "./money.js";

// Sonderwünsche: Zusatzleistungen (Mehrpreis) und Gutschriften (Minderleistungen) zum Kaufvertrag.
// Mit der Beauftragung entsteht eine Rate im Ratenplan; sie wird wie jede Rate angefordert, bezahlt und gemahnt.

export const SONDERWUNSCH_ARTEN = ["zusatzleistung", "gutschrift"] as const;
export type SonderwunschArt = (typeof SONDERWUNSCH_ARTEN)[number];
export const SONDERWUNSCH_ART_TEXT: Record<SonderwunschArt, string> = { zusatzleistung: "Zusatzleistung", gutschrift: "Gutschrift (Minderleistung)" };

export const SONDERWUNSCH_STATUS = ["angebot", "beauftragt", "abgelehnt"] as const;
export type SonderwunschStatus = (typeof SONDERWUNSCH_STATUS)[number];
export const SONDERWUNSCH_STATUS_TEXT: Record<SonderwunschStatus, string> = { angebot: "Angebot", beauftragt: "beauftragt", abgelehnt: "abgelehnt" };

const abschnittFeld = () =>
  z
    .string()
    .transform((s) => (s === "" ? null : s))
    .pipe(z.enum(MABV_ABSCHNITTE.map((a) => a.key) as [MabvAbschnitt, ...MabvAbschnitt[]], "Unbekannter Bauabschnitt").nullable())
    .nullish();

export const SonderwunschEingabe = z
  .object({
    art: z.enum(SONDERWUNSCH_ARTEN).default("zusatzleistung"),
    bezeichnung: pflichttext(200),
    beschreibung: text(4000),
    betragBrutto: geld().refine((b) => !!b && money(b).gt(0), "Betrag > 0 angeben"),
    kostenBrutto: geld().refine((b) => !b || money(b).gte(0), "Kosten dürfen nicht negativ sein"),
    gewerkId: uuidOptional(),
    abschnitt: abschnittFeld(),
    angebotAm: datum(),
    gueltigBis: datum(),
  })
  .refine((s) => !s.gueltigBis || !s.angebotAm || s.gueltigBis >= s.angebotAm, { message: "Gültig bis liegt vor dem Angebotsdatum", path: ["gueltigBis"] });
export type SonderwunschEingabe = z.infer<typeof SonderwunschEingabe>;

export const SonderwunschEntscheidung = z.object({ datum: datum().refine((d) => !!d, "Datum angeben") });

/** Rate, die bei der Beauftragung entsteht (Gutschrift mit negativem Betrag). */
export function sonderwunschRate(sw: { nr: number; art: SonderwunschArt; bezeichnung: string; betragBrutto: string; abschnitt: string | null }, rateNr: number) {
  const betrag = money(sw.betragBrutto);
  return {
    nr: rateNr,
    typ: sw.art,
    abschnitte: sw.abschnitt ? [sw.abschnitt] : [],
    prozent: null,
    betrag: (sw.art === "gutschrift" ? betrag.negated() : betrag).toFixed(2),
    text: `${sw.art === "gutschrift" ? "Gutschrift" : "Sonderwunsch"} Nr. ${sw.nr}: ${sw.bezeichnung}`,
  };
}

/** Summen über die Sonderwünsche eines Vertrags oder Projekts; Marge nur, wo Kosten erfasst sind. */
export function sonderwunschSummen(liste: { art: string; status: string; betragBrutto: string; kostenBrutto: string | null }[]) {
  const vorzeichen = (s: { art: string }, b: Money) => (s.art === "gutschrift" ? b.negated() : b);
  const je = (status: string) => summe(liste.filter((s) => s.status === status).map((s) => vorzeichen(s, money(s.betragBrutto))));
  const beauftragt = liste.filter((s) => s.status === "beauftragt");
  const mitKosten = beauftragt.filter((s) => s.kostenBrutto !== null);
  const marge = summe(mitKosten.map((s) => vorzeichen(s, money(s.betragBrutto).minus(s.kostenBrutto!))));
  return {
    angebote: je("angebot").toFixed(2),
    beauftragt: je("beauftragt").toFixed(2),
    zusatzleistungen: summe(beauftragt.filter((s) => s.art !== "gutschrift").map((s) => money(s.betragBrutto))).toFixed(2),
    gutschriften: summe(beauftragt.filter((s) => s.art === "gutschrift").map((s) => money(s.betragBrutto))).toFixed(2),
    marge: mitKosten.length ? marge.toFixed(2) : null,
    offeneAngebote: liste.filter((s) => s.status === "angebot").length,
  };
}

/** Angebot abgelaufen? */
export const angebotAbgelaufen = (s: { status: string; gueltigBis: string | null }, stichtag: string) => s.status === "angebot" && !!s.gueltigBis && s.gueltigBis < stichtag;
