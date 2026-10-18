import { z } from "zod";
import { datum, geld, text, uuidOptional } from "./felder.js";
import { money, summe, type Money } from "./money.js";
import { datumPlusTage } from "./verkauf.js";

// ---------------------------------------------------------------- SEPA-Überweisung (pain.001.001.09)

export const ZahlungslaufEingabe = z.object({
  rechnungIds: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid()).min(1, "Mindestens eine Rechnung auswählen")),
  ausfuehrungAm: datum().refine((d) => !!d, "Ausführungsdatum angeben").transform((d) => d!),
});

const UMLAUTE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "&": "+", "–": "-", "—": "-" };

/** Text auf den SEPA-Zeichensatz (DK, Latin-Teilmenge) bringen und kürzen. */
export function sepaText(s: string, max: number) {
  const t = s
    .replace(/[äöüÄÖÜß&–—]/g, (c) => UMLAUTE[c]!)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/?:().,'+ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");

export interface SepaZahlung {
  endToEndId: string;
  betrag: Money;
  name: string;
  iban: string;
  bic?: string | null;
  verwendungszweck: string;
}

export interface SepaAuftrag {
  msgId: string;
  erstelltAm: string;
  ausfuehrungAm: string;
  auftraggeber: { name: string; iban: string; bic?: string | null };
  zahlungen: SepaZahlung[];
}

/** Erzeugt eine SEPA-Sammelüberweisung (pain.001.001.09, DK-Spezifikation ab Version 3.7). */
export function pain001(a: SepaAuftrag): string {
  if (!a.zahlungen.length) throw new Error("Keine Zahlungen");
  const ctrl = summe(a.zahlungen.map((z) => z.betrag)).toFixed(2);
  const id = (s: string) => xml(sepaText(s, 35).replace(/ /g, "-"));
  const agent = (bic?: string | null) => (bic ? `<FinInstnId><BICFI>${xml(bic)}</BICFI></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`);
  const tx = a.zahlungen
    .map(
      (z) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${id(z.endToEndId)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${z.betrag.toFixed(2)}</InstdAmt></Amt>${z.bic ? `\n        <CdtrAgt>${agent(z.bic)}</CdtrAgt>` : ""}
        <Cdtr><Nm>${xml(sepaText(z.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${xml(z.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(z.verwendungszweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09 pain.001.001.09.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${id(a.msgId)}</MsgId>
      <CreDtTm>${a.erstelltAm.slice(0, 19)}</CreDtTm>
      <NbOfTxs>${a.zahlungen.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <InitgPty><Nm>${xml(sepaText(a.auftraggeber.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${id(a.msgId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${a.zahlungen.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt><Dt>${a.ausfuehrungAm}</Dt></ReqdExctnDt>
      <Dbtr><Nm>${xml(sepaText(a.auftraggeber.name, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${xml(a.auftraggeber.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${agent(a.auftraggeber.bic)}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

// ---------------------------------------------------------------- Bürgschaften

export const BUERGSCHAFT_ARTEN = ["vertragserfuellung", "gewaehrleistung", "vorauszahlung", "mabv7", "sonstige"] as const;
export type BuergschaftArt = (typeof BUERGSCHAFT_ARTEN)[number];
export const BUERGSCHAFT_ART_TEXT: Record<BuergschaftArt, string> = {
  vertragserfuellung: "Vertragserfüllungsbürgschaft",
  gewaehrleistung: "Gewährleistungsbürgschaft",
  vorauszahlung: "Vorauszahlungsbürgschaft",
  mabv7: "Bürgschaft nach § 7 MaBV",
  sonstige: "Sonstige Bürgschaft",
};

export const BuergschaftEingabe = z
  .object({
    richtung: z.enum(["erhalten", "ausgegeben"], "Richtung wählen"),
    art: z.enum(BUERGSCHAFT_ARTEN, "Art wählen"),
    handwerkervertragId: uuidOptional(),
    kaufvertragId: uuidOptional(),
    buergeId: uuidOptional(),
    nr: text(60),
    betrag: geld().refine((b) => !!b && money(b).gt(0), "Betrag > 0 angeben"),
    ausgestelltAm: datum(),
    gueltigBis: datum(),
    rueckgabeAm: datum(),
    bemerkung: text(500),
  })
  .refine((b) => b.richtung !== "erhalten" || !!b.handwerkervertragId, { path: ["handwerkervertragId"], message: "Erhaltene Bürgschaften gehören zu einem Handwerkervertrag" })
  .refine((b) => b.richtung !== "ausgegeben" || !!b.kaufvertragId, { path: ["kaufvertragId"], message: "Ausgegebene Bürgschaften gehören zu einem Kaufvertrag" })
  .refine((b) => b.art !== "mabv7" || b.richtung === "ausgegeben", { path: ["art"], message: "Eine § 7-MaBV-Bürgschaft gibt der Bauträger dem Käufer" });
export type BuergschaftEingabe = z.infer<typeof BuergschaftEingabe>;

export type BuergschaftStatus = "zurueckgegeben" | "abgelaufen" | "rueckgabe_faellig" | "laeuft_ab" | "aktiv";
export const BUERGSCHAFT_STATUS_TEXT: Record<BuergschaftStatus, string> = {
  zurueckgegeben: "zurückgegeben",
  abgelaufen: "abgelaufen",
  rueckgabe_faellig: "Rückgabe fällig",
  laeuft_ab: "läuft bald ab",
  aktiv: "aktiv",
};

/**
 * Wann eine Bürgschaft zurückzugeben ist:
 * Vertragserfüllung mit der Abnahme, Gewährleistung mit Ablauf der Gewährleistungsfrist,
 * § 7 MaBV mit Übergabe (vollständige Fertigstellung vorausgesetzt).
 */
export function rueckgabeFaelligAb(art: string, v: { abnahmeAm?: string | null; gewaehrleistungMonate?: number | null; uebergabeAm?: string | null }) {
  if (art === "vertragserfuellung") return v.abnahmeAm ?? null;
  if (art === "gewaehrleistung") {
    if (!v.abnahmeAm || v.gewaehrleistungMonate == null) return null;
    const [j, m, t] = v.abnahmeAm.split("-").map(Number);
    return new Date(Date.UTC(j!, m! - 1 + v.gewaehrleistungMonate, t!)).toISOString().slice(0, 10);
  }
  if (art === "mabv7") return v.uebergabeAm ?? null;
  return null;
}

export function buergschaftStatus(b: { gueltigBis: string | null; rueckgabeAm: string | null; rueckgabeFaelligAb: string | null }, stichtag: string, vorlaufTage = 60): BuergschaftStatus {
  if (b.rueckgabeAm) return "zurueckgegeben";
  if (b.gueltigBis && b.gueltigBis < stichtag) return "abgelaufen";
  if (b.rueckgabeFaelligAb && b.rueckgabeFaelligAb <= stichtag) return "rueckgabe_faellig";
  if (b.gueltigBis && b.gueltigBis <= datumPlusTage(stichtag, vorlaufTage)) return "laeuft_ab";
  return "aktiv";
}
