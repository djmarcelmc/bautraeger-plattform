import { XMLParser } from "fast-xml-parser";
import { suchcodeVorschlag } from "./import.js";
import { money } from "./money.js";

// Rechnungseingang: Rechnungen kommen per E-Mail (Postfach) oder Upload. Strukturierte E-Rechnungen (XRechnung als
// CII oder UBL, ZUGFeRD/Factur-X mit eingebettetem XML) werden ausgelesen, sonst wird der PDF-Text durchsucht.
// Daraus entstehen Vorschläge für Handwerker, Vertrag und die Felder der Eingangsrechnung.

export interface Rechnungsdaten {
  quelle: "xrechnung-cii" | "xrechnung-ubl" | "pdf-text" | "keine";
  rechnungsnr: string | null;
  rechnungsdatum: string | null;
  /** Bruttobetrag (zu zahlen) */
  betragBrutto: string | null;
  /** Rechnungsersteller */
  verkaeufer: string | null;
  iban: string | null;
  ustId: string | null;
  steuernummer: string | null;
  /** Bestell-/Projektreferenz (z. B. Bauvorhaben) */
  referenz: string | null;
  schlussrechnung: boolean;
}

const LEER: Rechnungsdaten = { quelle: "keine", rechnungsnr: null, rechnungsdatum: null, betragBrutto: null, verkaeufer: null, iban: null, ustId: null, steuernummer: null, referenz: null, schlussrechnung: false };

const t = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return t(v[0]);
  if (typeof v === "object") return t((v as Record<string, unknown>)["#text"]);
  const s = String(v).trim();
  return s || null;
};
const ibanNorm = (s: string | null) => (s ? s.replace(/\s/g, "").toUpperCase() : null);
const betrag = (s: string | null) => {
  if (!s) return null;
  try {
    return money(s).toFixed(2);
  } catch {
    return null;
  }
};
const schlussText = (s: string) => /schlussrechnung|schlu(ss|ß)rechnung|final invoice/i.test(s);

/** XRechnung/ZUGFeRD-XML (UN/CEFACT CII oder OASIS UBL). */
export function eRechnungLesen(xml: string): Rechnungsdaten | null {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, trimValues: true });
  let doc: Record<string, any>;
  try {
    doc = p.parse(xml);
  } catch {
    return null;
  }
  const cii = doc.CrossIndustryInvoice;
  if (cii) {
    const kopf = cii.ExchangedDocument ?? {};
    const handel = cii.SupplyChainTradeTransaction ?? {};
    const vereinbarung = handel.ApplicableHeaderTradeAgreement ?? {};
    const abrechnung = handel.ApplicableHeaderTradeSettlement ?? {};
    const summen = abrechnung.SpecifiedTradeSettlementHeaderMonetarySummation ?? {};
    const verkaeufer = vereinbarung.SellerTradeParty ?? {};
    const steuer = [].concat(verkaeufer.SpecifiedTaxRegistration ?? []) as Record<string, any>[];
    const steuerId = (schema: string) => t(steuer.find((s) => s?.ID?.["@schemeID"] === schema)?.ID);
    const zahlung = [].concat(abrechnung.SpecifiedTradeSettlementPaymentMeans ?? []) as Record<string, any>[];
    const datum = t(kopf.IssueDateTime?.DateTimeString);
    const typ = t(kopf.TypeCode);
    const notizen = [].concat(kopf.IncludedNote ?? []).map((n: any) => t(n?.Content) ?? "").join(" ");
    return {
      quelle: "xrechnung-cii",
      rechnungsnr: t(kopf.ID),
      rechnungsdatum: datum && /^\d{8}$/.test(datum) ? `${datum.slice(0, 4)}-${datum.slice(4, 6)}-${datum.slice(6, 8)}` : null,
      betragBrutto: betrag(t(summen.DuePayableAmount) ?? t(summen.GrandTotalAmount)),
      verkaeufer: t(verkaeufer.Name),
      iban: ibanNorm(zahlung.map((z) => t(z?.PayeePartyCreditorFinancialAccount?.IBANID)).find(Boolean) ?? null),
      ustId: steuerId("VA"),
      steuernummer: steuerId("FC"),
      referenz: t(vereinbarung.BuyerReference) ?? t(vereinbarung.BuyerOrderReferencedDocument?.IssuerAssignedID) ?? t(vereinbarung.ContractReferencedDocument?.IssuerAssignedID),
      // 875 Teilschlussrechnung / 876 Schlussrechnung (UNTDID 1001) bzw. Hinweis im Text
      schlussrechnung: typ === "876" || schlussText(notizen),
    };
  }
  const ubl = doc.Invoice ?? doc.CreditNote;
  if (ubl) {
    const verkaeufer = ubl.AccountingSupplierParty?.Party ?? {};
    const steuer = [].concat(verkaeufer.PartyTaxScheme ?? []) as Record<string, any>[];
    const zahlung = [].concat(ubl.PaymentMeans ?? []) as Record<string, any>[];
    const summen = ubl.LegalMonetaryTotal ?? {};
    return {
      quelle: "xrechnung-ubl",
      rechnungsnr: t(ubl.ID),
      rechnungsdatum: t(ubl.IssueDate),
      betragBrutto: betrag(t(summen.PayableAmount) ?? t(summen.TaxInclusiveAmount)),
      verkaeufer: t(verkaeufer.PartyLegalEntity?.RegistrationName) ?? t(verkaeufer.PartyName?.Name),
      iban: ibanNorm(zahlung.map((z) => t(z?.PayeeFinancialAccount?.ID)).find(Boolean) ?? null),
      ustId: t(steuer.find((s) => t(s?.TaxScheme?.ID) === "VAT")?.CompanyID),
      steuernummer: t(steuer.find((s) => t(s?.TaxScheme?.ID) !== "VAT")?.CompanyID),
      referenz: t(ubl.BuyerReference) ?? t(ubl.OrderReference?.ID) ?? t(ubl.ContractDocumentReference?.ID),
      schlussrechnung: schlussText([].concat(ubl.Note ?? []).map((n) => t(n) ?? "").join(" ")),
    };
  }
  return null;
}

const DATUM = String.raw`(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)`;
const zuIso = (m: RegExpExecArray | null, offset = 1) => {
  if (!m) return null;
  const j = m[offset + 2]!.length === 2 ? `20${m[offset + 2]}` : m[offset + 2]!;
  const mo = m[offset + 1]!.padStart(2, "0");
  const ta = m[offset]!.padStart(2, "0");
  return Number(mo) >= 1 && Number(mo) <= 12 && Number(ta) >= 1 && Number(ta) <= 31 ? `${j}-${mo}-${ta}` : null;
};
const deBetrag = (s: string) => {
  const n = s.replace(/\s|€|EUR/g, "");
  const norm = /,\d{2}$/.test(n) ? n.replace(/\./g, "").replace(",", ".") : /\.\d{2}$/.test(n) ? n.replace(/,/g, "") : null;
  return norm && /^\d+(\.\d{2})$/.test(norm) ? money(norm).toFixed(2) : null;
};

/** Heuristik für PDF-Text (deutsche Handwerkerrechnungen). */
export function rechnungstextLesen(text: string): Rechnungsdaten {
  const s = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const nr = /(?:Rechnungs?[- ]?(?:nummer|nr\.?|no\.?)|Rechnung\s+Nr\.?|Re\.?-?Nr\.?|Belegnummer)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/._]{1,30})/i.exec(s);
  const datum = new RegExp(String.raw`(?:Rechnungsdatum|Datum der Rechnung|Re\.?-?Datum|Datum)\s*:?\s*${DATUM}`, "i").exec(s);
  // Endbetrag: bevorzugt „zu zahlen“/„Gesamtbetrag“/„Rechnungsbetrag“/„Endbetrag“, sonst „brutto“
  const betragsMuster = [
    /(?:zu zahlen(?:der Betrag)?|Zahlbetrag|Gesamtbetrag|Rechnungsbetrag|Endbetrag|Gesamtsumme brutto|Summe brutto|Bruttobetrag|Gesamt brutto)\s*(?:EUR|€)?\s*:?\s*(?:EUR|€)?\s*([\d.,]+\d{2})/gi,
    /(?:brutto|Gesamt)\s*(?:EUR|€)?\s*:?\s*([\d.,]+\d{2})/gi,
  ];
  let brutto: string | null = null;
  for (const m of betragsMuster) {
    const treffer = [...s.matchAll(m)].map((x) => deBetrag(x[1]!)).filter((x): x is string => !!x);
    // bei mehreren Treffern (Zwischensummen) den letzten nehmen – der Endbetrag steht unten
    if (treffer.length) {
      brutto = treffer[treffer.length - 1]!;
      break;
    }
  }
  const iban = /\b(DE\d{2}(?:\s?\d{4}){4}\s?\d{2})\b/.exec(s);
  const ust = /\b(DE\s?\d{9})\b/.exec(s);
  const stnr = /(?:Steuer-?\s?(?:nummer|nr\.?)|St\.?-?Nr\.?)\s*:?\s*(\d{2,5}\/\d{3,5}(?:\/\d{4,5})?|\d{10,13})/i.exec(s);
  const ref = /(?:Bauvorhaben|BV|Objekt|Projekt|Baustelle)\s*:?\s*([^\n]{3,60})/i.exec(s);
  const ersteZeile = s.split("\n").map((z) => z.trim()).find((z) => /\b(GmbH|KG|AG|e\.K\.|GbR|UG|OHG|Inh\.)\b/.test(z));
  return {
    quelle: "pdf-text",
    rechnungsnr: nr?.[1]?.replace(/[.,]$/, "") ?? null,
    rechnungsdatum: zuIso(datum),
    betragBrutto: brutto,
    verkaeufer: ersteZeile?.slice(0, 80) ?? null,
    iban: ibanNorm(iban?.[1] ?? null),
    ustId: ust?.[1]?.replace(/\s/g, "") ?? null,
    steuernummer: stnr?.[1] ?? null,
    referenz: ref?.[1]?.trim() ?? null,
    schlussrechnung: schlussText(s),
  };
}

/** Strukturierte Daten haben Vorrang; fehlende Felder werden aus dem PDF-Text ergänzt. */
export function rechnungsdatenZusammenfuehren(xml: Rechnungsdaten | null, text: Rechnungsdaten | null): Rechnungsdaten {
  if (!xml && !text) return LEER;
  if (!xml) return text!;
  if (!text) return xml;
  const r = { ...xml };
  for (const k of Object.keys(r) as (keyof Rechnungsdaten)[]) if (r[k] === null && text[k] !== null) (r as Record<string, unknown>)[k] = text[k];
  r.schlussrechnung = xml.schlussrechnung || text.schlussrechnung;
  return r;
}

// ------------------------------------------------------------------ EingangVorschlag Handwerker & Vertrag

export interface HandwerkerKandidat {
  id: string;
  name: string;
  email: string | null;
  iban: string | null;
  steuernummer: string | null;
}

export interface VertragKandidat {
  id: string;
  handwerkerId: string | null;
  projektNr: number;
  projektSuchcode: string;
  projektOrt: string | null;
  gewerk: string;
  /** Vertrag hat bereits eine Schlussrechnung */
  abgeschlossen: boolean;
  /** Es gibt eine noch nicht bezahlte Rechnung (neue Abschläge erst danach) */
  offeneRechnung: boolean;
}

export interface EingangVorschlag {
  handwerkerId: string | null;
  handwerkervertragId: string | null;
  sicherheit: "sicher" | "wahrscheinlich" | "moeglich" | null;
  gruende: string[];
}

const woerter = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9ß]+/)
      .filter((w) => w.length >= 4 && !["gmbh", "bauunternehmen", "und", "inhaber", "handwerk", "service", "meisterbetrieb"].includes(w)),
  );

/**
 * Handwerker über IBAN, Steuernummer, Absenderadresse (bzw. Domain) oder Namen; Vertrag über Bauvorhaben-Bezug
 * (Projektnummer, Suchcode oder Ort im Text) oder – wenn eindeutig – den einzigen offenen Vertrag.
 */
export function eingangVorschlag(d: Rechnungsdaten, text: string, absender: string | null, handwerker: HandwerkerKandidat[], vertraege: VertragKandidat[]): EingangVorschlag {
  const gruende: string[] = [];
  const iban = ibanNorm(d.iban);
  const nachIban = iban ? handwerker.filter((h) => ibanNorm(h.iban) === iban) : [];
  const nachStnr = d.steuernummer ? handwerker.filter((h) => h.steuernummer && h.steuernummer.replace(/\D/g, "") === d.steuernummer!.replace(/\D/g, "")) : [];
  const mail = absender?.toLowerCase() ?? "";
  const domain = mail.split("@")[1] ?? "";
  const freemail = /^(gmail|googlemail|gmx|web|t-online|outlook|hotmail|yahoo|icloud|freenet|aol)\./.test(domain);
  const nachMail = mail ? handwerker.filter((h) => h.email?.toLowerCase() === mail || (!freemail && domain && h.email?.toLowerCase().endsWith(`@${domain}`))) : [];
  const textWoerter = woerter(`${d.verkaeufer ?? ""} ${text.slice(0, 1500)}`);
  const nachName = handwerker.filter((h) => {
    const w = [...woerter(h.name)];
    return w.length > 0 && w.every((x) => textWoerter.has(x));
  });
  const treffer = [
    { liste: nachIban, sicherheit: "sicher" as const, grund: "IBAN stimmt überein" },
    { liste: nachStnr, sicherheit: "sicher" as const, grund: "Steuernummer stimmt überein" },
    { liste: nachMail, sicherheit: "wahrscheinlich" as const, grund: `Absender ${absender}` },
    { liste: nachName, sicherheit: "wahrscheinlich" as const, grund: "Firmenname im Rechnungstext" },
  ].find((x) => x.liste.length === 1);
  const h = treffer?.liste[0];
  let sicherheit: EingangVorschlag["sicherheit"] = treffer?.sicherheit ?? null;
  if (treffer) gruende.push(treffer.grund);
  // Schutz vor Rechnungsbetrug: abweichende Bankverbindung deutlich anzeigen
  if (h && iban && h.iban && ibanNorm(h.iban) !== iban) {
    gruende.push(`Achtung: IBAN auf der Rechnung (${iban}) weicht von der hinterlegten ab – vor Zahlung telefonisch beim Handwerker bestätigen`);
    if (sicherheit === "sicher") sicherheit = "wahrscheinlich";
  }
  if (!h) return { handwerkerId: null, handwerkervertragId: null, sicherheit: null, gruende: ["Handwerker nicht erkannt"] };
  const eigene = vertraege.filter((v) => v.handwerkerId === h!.id && !v.abgeschlossen);
  const such = `${d.referenz ?? ""} ${text}`.toLowerCase();
  const mitBezug = eigene.filter((v) => new RegExp(`\\b${v.projektNr}\\b`).test(such) || such.includes(v.projektSuchcode.toLowerCase()) || (v.projektOrt && such.includes(v.projektOrt.toLowerCase())));
  const vertrag = mitBezug.length === 1 ? mitBezug[0] : eigene.length === 1 ? eigene[0] : undefined;
  if (mitBezug.length === 1) gruende.push(`Bauvorhaben ${vertrag!.projektNr} ${vertrag!.projektSuchcode} im Text`);
  else if (vertrag) gruende.push("einziger offener Vertrag des Handwerkers");
  else {
    gruende.push(eigene.length ? `${eigene.length} offene Verträge – bitte wählen` : "kein offener Vertrag mit diesem Handwerker");
    if (sicherheit === "sicher") sicherheit = "wahrscheinlich";
  }
  if (vertrag?.offeneRechnung) gruende.push("Achtung: frühere Rechnung dieses Vertrags ist noch nicht bezahlt");
  return { handwerkerId: h.id, handwerkervertragId: vertrag?.id ?? null, sicherheit: vertrag ? sicherheit : sicherheit === "sicher" ? "wahrscheinlich" : "moeglich", gruende };
}

const FREEMAIL = /@(gmail|googlemail|gmx|web|t-online|outlook|hotmail|yahoo|icloud|freenet|aol)\./i;

/** Stammdaten für einen neuen Handwerker aus der Rechnung (Firma, Suchcode, IBAN, Steuernummer, Absender-Mail). */
export function neuerHandwerker(d: Rechnungsdaten, absender: string | null) {
  const firma = d.verkaeufer?.replace(/\s*[·|,].*$/, "").trim() || null;
  return {
    firma,
    suchcode: suchcodeVorschlag(firma) || null,
    iban: d.iban,
    steuernummer: d.steuernummer,
    email: absender && !FREEMAIL.test(absender) ? absender : null,
  };
}

/** Bauvorhaben, auf das sich die Rechnung bezieht (Projektnummer, Suchcode oder Ort im Bezug bzw. Text). */
export function projektVorschlag(d: Rechnungsdaten, text: string, projekte: { id: string; nr: number; suchcode: string; ort: string | null }[]): string | null {
  const such = `${d.referenz ?? ""} ${text}`.toLowerCase();
  const passend = projekte.filter((p) => new RegExp(`\\b${p.nr}\\b`).test(such) || such.includes(p.suchcode.toLowerCase()));
  if (passend.length === 1) return passend[0]!.id;
  const nachOrt = projekte.filter((p) => p.ort && such.includes(p.ort.toLowerCase()));
  return nachOrt.length === 1 ? nachOrt[0]!.id : null;
}

const stamm = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-zß]+/)
      .filter((w) => w.length >= 5)
      .map((w) => w.slice(0, 5)),
  );

/**
 * Gewerk für einen neuen Vertrag: Wortstamm der Gewerkbezeichnung im Firmennamen (z. B. „Fliesen Kaiser“ →
 * „Fliesenarbeiten“), sonst im Rechnungstext – nur wenn eindeutig.
 */
export function gewerkVorschlag(gewerke: { id: string; bezeichnung: string }[], ...hinweise: string[]): string | null {
  for (const h of hinweise) {
    const w = stamm(h);
    const treffer = gewerke.filter((g) => [...stamm(g.bezeichnung)].some((s) => w.has(s)));
    if (treffer.length === 1) return treffer[0]!.id;
  }
  return null;
}
