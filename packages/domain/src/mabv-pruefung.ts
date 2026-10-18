import { MABV_ABSCHNITTE, MABV_MAX_RATEN, abschnittsAnteil, ratenplanPruefen, type MabvAbschnitt } from "./mabv.js";
import { money, summe } from "./money.js";

/**
 * Prüfhilfe für die Prüfung nach § 16 MaBV: Ratenplan (§ 3 Abs. 2), Bautenstand und
 * Fälligkeitsvoraussetzungen (§ 3 Abs. 1) bzw. Sicherheit (§ 7) je Zahlungsanforderung.
 * Ergebnis sind Feststellungen zur Würdigung durch den Prüfer – keine rechtliche Bewertung.
 */

export type FeststellungArt = "ratenplan" | "bautenstand" | "voraussetzung" | "sicherheit";
export interface Feststellung {
  art: FeststellungArt;
  /** verstoss = Abweichung von der MaBV laut Datenlage; hinweis = Datenlücke oder Prüfpunkt. */
  schwere: "verstoss" | "hinweis";
  text: string;
  rechnungsnr?: string;
}

export const FESTSTELLUNG_ART_TEXT: Record<FeststellungArt, string> = {
  ratenplan: "Ratenplan (§ 3 Abs. 2)",
  bautenstand: "Bautenstand (§ 3 Abs. 2)",
  voraussetzung: "Fälligkeitsvoraussetzungen (§ 3 Abs. 1)",
  sicherheit: "Sicherheit (§ 7)",
};

const ABSCHNITT_TEXT = Object.fromEntries(MABV_ABSCHNITTE.map((a, i) => [a.key, `${i + 1}. ${a.bezeichnung.replace(/^(nach|für die|für den) /, "")}`])) as Record<MabvAbschnitt, string>;
const de = (iso: string) => iso.split("-").reverse().join(".");

export interface PruefVertrag {
  erbbaurecht: boolean;
  vertragWirksam: boolean;
  vormerkungEingetragenAm: string | null;
  lastenfreistellungGesichert: boolean;
  buergschaftNach7: boolean;
  einheiten: { id: string; typ: string; vkBrutto: string }[];
  meldungen: { einheitId: string; abschnitt: string; fertigAm: string }[];
  raten: { nr: number; typ: string; abschnitte: string[]; prozent: string | null; betrag: string; zahlungsanforderungId: string | null }[];
  anforderungen: { id: string; rechnungsnr: string; angefordertAm: string; faelligAm: string; betrag: string }[];
  buergschaften7: { betrag: string; ausgestelltAm: string | null; rueckgabeAm: string | null }[];
}

/** Datum, ab dem ein Abschnitt für alle maßgeblichen Einheiten fertig gemeldet war (Stellplätze zählen nur ohne Wohnung). */
export function abschnittFertigAm(v: Pick<PruefVertrag, "einheiten" | "meldungen">, abschnitt: string): string | null {
  const ohneStellplatz = v.einheiten.filter((e) => e.typ !== "stellplatz");
  const relevant = ohneStellplatz.length ? ohneStellplatz : v.einheiten;
  if (!relevant.length) return null;
  let spaetestens = "";
  for (const e of relevant) {
    const m = v.meldungen.find((x) => x.einheitId === e.id && x.abschnitt === abschnitt);
    if (!m) return null;
    if (m.fertigAm > spaetestens) spaetestens = m.fertigAm;
  }
  return spaetestens;
}

export function mabvPruefung(v: PruefVertrag, zeitraum: { von: string; bis: string }) {
  const feststellungen: Feststellung[] = [];
  const mabvRaten = v.raten.filter((r) => r.typ === "mabv");
  const vertragssumme = summe(v.einheiten.map((e) => money(e.vkBrutto)));

  // ---- Ratenplan
  if (mabvRaten.length > MABV_MAX_RATEN) feststellungen.push({ art: "ratenplan", schwere: "verstoss", text: `${mabvRaten.length} Raten vereinbart – höchstens ${MABV_MAX_RATEN} zulässig.` });
  for (const f of ratenplanPruefen(mabvRaten.map((r) => ({ abschnitte: r.abschnitte as MabvAbschnitt[] })))) {
    if (!f.startsWith("Höchstens")) feststellungen.push({ art: "ratenplan", schwere: "verstoss", text: f.replace(/„(\w+)“/, (_, k: string) => `„${ABSCHNITT_TEXT[k as MabvAbschnitt] ?? k}“`) });
  }
  for (const r of mabvRaten) {
    const soll = r.abschnitte.reduce((s, a) => s.plus(abschnittsAnteil(a as MabvAbschnitt, { erbbaurecht: v.erbbaurecht })), money(0));
    if (r.prozent !== null && money(r.prozent).minus(soll).abs().gt("0.0001"))
      feststellungen.push({ art: "ratenplan", schwere: "verstoss", text: `Rate ${r.nr}: ${money(r.prozent).toFixed(4)} % statt höchstens ${soll.toFixed(4)} % für die enthaltenen Bauabschnitte.` });
  }
  const ratenSumme = summe(mabvRaten.map((r) => money(r.betrag)));
  if (mabvRaten.length && ratenSumme.minus(vertragssumme).abs().gt("0.01"))
    feststellungen.push({ art: "ratenplan", schwere: "hinweis", text: `Summe der MaBV-Raten (${ratenSumme.toFixed(2)} €) weicht von der Vertragssumme (${vertragssumme.toFixed(2)} €) ab.` });

  // ---- je Zahlungsanforderung im Zeitraum
  const anforderungen = [...v.anforderungen].sort((a, b) => a.angefordertAm.localeCompare(b.angefordertAm));
  let kumuliert = money(0);
  const geprueft = anforderungen.map((a) => {
    kumuliert = kumuliert.plus(a.betrag);
    const imZeitraum = a.angefordertAm >= zeitraum.von && a.angefordertAm <= zeitraum.bis;
    const eigene: Feststellung[] = [];
    const raten = v.raten
      .filter((r) => r.zahlungsanforderungId === a.id)
      .map((r) => ({
        nr: r.nr,
        typ: r.typ,
        prozent: r.prozent,
        betrag: r.betrag,
        abschnitte: r.abschnitte.map((k) => {
          const fertigAm = abschnittFertigAm(v, k);
          return { key: k, text: ABSCHNITT_TEXT[k as MabvAbschnitt] ?? k, fertigAm, rechtzeitig: !!fertigAm && fertigAm <= a.angefordertAm };
        }),
      }));
    if (imZeitraum) {
      for (const r of raten)
        for (const ab of r.abschnitte.filter((x) => !x.rechtzeitig))
          eigene.push({
            art: "bautenstand",
            schwere: "verstoss",
            rechnungsnr: a.rechnungsnr,
            text: ab.fertigAm
              ? `Rate ${r.nr} am ${de(a.angefordertAm)} angefordert, „${ab.text}“ aber erst am ${de(ab.fertigAm)} für alle Einheiten fertig gemeldet.`
              : `Rate ${r.nr} am ${de(a.angefordertAm)} angefordert, „${ab.text}“ ist nicht für alle Einheiten fertig gemeldet.`,
          });
      if (v.buergschaftNach7) {
        const gueltig = v.buergschaften7.filter((b) => (!b.ausgestelltAm || b.ausgestelltAm <= a.angefordertAm) && (!b.rueckgabeAm || b.rueckgabeAm > a.angefordertAm));
        const deckung = summe(gueltig.map((b) => money(b.betrag)));
        if (!gueltig.length) eigene.push({ art: "sicherheit", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: `Sicherung nach § 7 vereinbart, am ${de(a.angefordertAm)} lag aber keine Bürgschaft vor.` });
        else if (deckung.lt(kumuliert))
          eigene.push({ art: "sicherheit", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: `Bürgschaft(en) über ${deckung.toFixed(2)} € decken die bis ${de(a.angefordertAm)} angeforderten ${kumuliert.toFixed(2)} € nicht.` });
        if (gueltig.some((b) => !b.ausgestelltAm)) eigene.push({ art: "sicherheit", schwere: "hinweis", rechnungsnr: a.rechnungsnr, text: "Ausstellungsdatum der Bürgschaft fehlt – zeitliche Deckung nicht prüfbar." });
      } else {
        if (!v.vormerkungEingetragenAm) eigene.push({ art: "voraussetzung", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: "Eintragung der Auflassungsvormerkung ist nicht erfasst." });
        else if (v.vormerkungEingetragenAm > a.angefordertAm)
          eigene.push({ art: "voraussetzung", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: `Angefordert am ${de(a.angefordertAm)}, Vormerkung erst am ${de(v.vormerkungEingetragenAm)} eingetragen.` });
        if (!v.vertragWirksam) eigene.push({ art: "voraussetzung", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: "Wirksamkeit des Vertrags ist nicht bestätigt." });
        if (!v.lastenfreistellungGesichert) eigene.push({ art: "voraussetzung", schwere: "verstoss", rechnungsnr: a.rechnungsnr, text: "Lastenfreistellung ist nicht als gesichert erfasst." });
      }
    }
    feststellungen.push(...eigene);
    return { ...a, imZeitraum, kumuliert: kumuliert.toFixed(2), raten, feststellungen: eigene, ordnungsgemaess: imZeitraum ? !eigene.some((f) => f.schwere === "verstoss") : null };
  });

  return {
    vertragssumme: vertragssumme.toFixed(2),
    sicherung: v.buergschaftNach7 ? ("§ 7" as const) : ("§ 3" as const),
    anforderungen: geprueft,
    feststellungen,
    verstoesse: feststellungen.filter((f) => f.schwere === "verstoss").length,
  };
}
