import { XMLParser } from "fast-xml-parser";
import { money, summe } from "./money.js";

// Bankabgleich: Kontoauszüge (CAMT.053/052/054 als XML, MT940 als Text) einlesen und die Umsätze den offenen
// Zahlungsanforderungen (Gutschriften) bzw. den Zahlungsläufen an Handwerker (Lastschriften) zuordnen.

export interface Bankumsatz {
  buchungsdatum: string;
  valuta: string | null;
  /** mit Vorzeichen: Gutschrift positiv, Belastung negativ */
  betrag: string;
  waehrung: string;
  name: string | null;
  iban: string | null;
  verwendungszweck: string;
  endToEndId: string | null;
  /** Bankreferenz (AcctSvcrRef / Bankreferenz aus :61:) */
  bankreferenz: string | null;
}

export interface Kontoauszug {
  format: "camt" | "mt940";
  kontoIban: string | null;
  umsaetze: Bankumsatz[];
}

const liste = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return txt((v as Record<string, unknown>)["#text"]);
  const s = String(v).trim();
  return s ? s : null;
};
const datumVon = (v: unknown): string | null => {
  const o = (v ?? {}) as Record<string, unknown>;
  return (txt(o.Dt) ?? txt(o.DtTm))?.slice(0, 10) ?? null;
};
const ohneLeer = (s: string) => s.replace(/\s+/g, " ").trim();
const keineAngabe = (s: string | null) => (s && s !== "NOTPROVIDED" ? s : null);

/** CAMT.053 (Kontoauszug), CAMT.052 (Umsatzinformation) oder CAMT.054 (Sammlerauflösung). */
export function camtLesen(xml: string): Kontoauszug {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, trimValues: true });
  const doc = p.parse(xml) as Record<string, Record<string, unknown>>;
  const wurzel = doc.Document ?? {};
  const inhalt = (wurzel.BkToCstmrStmt ?? wurzel.BkToCstmrAcctRpt ?? wurzel.BkToCstmrDbtCdtNtfctn) as Record<string, unknown> | undefined;
  if (!inhalt) throw new Error("Keine CAMT-Datei (BkToCstmrStmt/AcctRpt/DbtCdtNtfctn fehlt)");
  const auszuege = [...liste(inhalt.Stmt), ...liste(inhalt.Rpt), ...liste(inhalt.Ntfctn)] as Record<string, any>[];
  let kontoIban: string | null = null;
  const umsaetze: Bankumsatz[] = [];
  for (const a of auszuege) {
    kontoIban ??= txt(a.Acct?.Id?.IBAN);
    for (const n of liste(a.Ntry) as Record<string, any>[]) {
      if (txt(n.Sts?.Cd ?? n.Sts) === "PDNG") continue; // vorgemerkte Umsätze nicht übernehmen
      const haben = txt(n.CdtDbtInd) === "CRDT";
      const gesamt = money(txt(n.Amt) ?? "0");
      const waehrung = txt(n.Amt?.["@Ccy"]) ?? "EUR";
      const buchungsdatum = datumVon(n.BookgDt) ?? datumVon(n.ValDt) ?? "";
      const valuta = datumVon(n.ValDt);
      const details = liste(n.NtryDtls).flatMap((d: any) => liste(d.TxDtls)) as Record<string, any>[];
      const posten = details.length ? details : [{}];
      for (const t of posten) {
        // Bei Sammelbuchungen mit Einzelbeträgen je Transaktion aufteilen
        const einzel = posten.length > 1 ? txt(t.AmtDtls?.TxAmt?.Amt ?? t.Amt) : null;
        const betrag = einzel ? money(einzel) : gesamt;
        const partei = haben ? t.RltdPties?.Dbtr : t.RltdPties?.Cdtr;
        const konto = haben ? t.RltdPties?.DbtrAcct : t.RltdPties?.CdtrAcct;
        const zweck = [...liste(t.RmtInf?.Ustrd).map(txt), txt(n.AddtlNtryInf)].filter(Boolean).join(" ");
        umsaetze.push({
          buchungsdatum,
          valuta,
          betrag: (haben ? betrag : betrag.negated()).toFixed(2),
          waehrung,
          name: txt(partei?.Pty?.Nm ?? partei?.Nm),
          iban: txt(konto?.Id?.IBAN),
          verwendungszweck: ohneLeer(zweck),
          endToEndId: keineAngabe(txt(t.Refs?.EndToEndId)),
          bankreferenz: txt(t.Refs?.AcctSvcrRef) ?? txt(n.AcctSvcrRef) ?? txt(n.NtryRef),
        });
      }
    }
  }
  return { format: "camt", kontoIban, umsaetze };
}

/** MT940 (SWIFT) mit Feld 86 im deutschen strukturierten Format (?20–?29 Verwendungszweck, ?31 IBAN, ?32/?33 Name). */
export function mt940Lesen(text: string): Kontoauszug {
  const zeilen = text.replace(/\r/g, "").split("\n");
  // Felder zusammensetzen (Folgezeilen gehören zum vorherigen Feld)
  const felder: { tag: string; wert: string }[] = [];
  for (const z of zeilen) {
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(z);
    if (m) felder.push({ tag: m[1]!, wert: m[2]! });
    else if (felder.length && z.trim() && z.trim() !== "-") felder[felder.length - 1]!.wert += `\n${z}`;
  }
  let kontoIban: string | null = null;
  let waehrung = "EUR";
  const umsaetze: Bankumsatz[] = [];
  for (const f of felder) {
    if (f.tag === "25") {
      const k = f.wert.trim().replace(/\s/g, "");
      if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(k)) kontoIban ??= k;
    } else if (f.tag === "60F" || f.tag === "60M") {
      waehrung = f.wert.slice(7, 10) || "EUR";
    } else if (f.tag === "61") {
      const m = /^(\d{2})(\d{2})(\d{2})(\d{4})?(R?[CD])([A-Z])?([\d,]+)N?([A-Z0-9]{3})?([^\n/]*)(?:\/\/([^\n]*))?/.exec(f.wert);
      if (!m) continue;
      const [, jj, mm, tt, buchung, kz, , betragText, , kundenref, bankref] = m;
      const valuta = `20${jj}-${mm}-${tt}`;
      let buchungsdatum = valuta;
      if (buchung) {
        // Buchungsdatum ohne Jahr: Jahreswechsel berücksichtigen
        const jahr = Number(`20${jj}`) + (mm === "01" && buchung.startsWith("12") ? -1 : mm === "12" && buchung.startsWith("01") ? 1 : 0);
        buchungsdatum = `${jahr}-${buchung.slice(0, 2)}-${buchung.slice(2)}`;
      }
      const haben = kz === "C" || kz === "RD";
      const betrag = money(betragText!.replace(",", "."));
      umsaetze.push({
        buchungsdatum,
        valuta,
        betrag: (haben ? betrag : betrag.negated()).toFixed(2),
        waehrung,
        name: null,
        iban: null,
        verwendungszweck: "",
        endToEndId: null,
        bankreferenz: keineAngabe(bankref?.trim() || null) ?? (kundenref?.trim() && kundenref.trim() !== "NONREF" ? kundenref.trim() : null),
      });
    } else if (f.tag === "86" && umsaetze.length) {
      const u = umsaetze[umsaetze.length - 1]!;
      const roh = f.wert.replace(/\n/g, "");
      const teile = new Map<string, string>();
      for (const m of roh.matchAll(/\?(\d{2})([^?]*)/g)) teile.set(m[1]!, (teile.get(m[1]!) ?? "") + m[2]!);
      const zweck = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "60", "61", "62", "63"].map((k) => teile.get(k) ?? "").join("");
      const name = `${teile.get("32") ?? ""}${teile.get("33") ?? ""}`.trim();
      const iban = (teile.get("31") ?? "").trim();
      const eref = /EREF\+(.+?)(?=(?:KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE|IBAN|BIC)\+|$)/.exec(zweck)?.[1]?.trim();
      const svwz = /SVWZ\+(.+?)(?=(?:ABWA|ABWE|IBAN|BIC)\+|$)/.exec(zweck)?.[1];
      u.verwendungszweck = ohneLeer(svwz ?? zweck.replace(/(EREF|KREF|MREF|CRED|DEBT)\+\S+/g, ""));
      u.name = name || null;
      u.iban = /^[A-Z]{2}\d{2}/.test(iban) ? iban : null;
      u.endToEndId = keineAngabe(eref ?? null);
    }
  }
  return { format: "mt940", kontoIban, umsaetze };
}

/** Erkennt das Format am Inhalt. */
export function kontoauszugLesen(daten: Buffer | string): Kontoauszug {
  const roh = typeof daten === "string" ? daten : daten.toString("utf8");
  if (/<\?xml|<Document[\s>]/.test(roh.slice(0, 2000))) return camtLesen(roh);
  if (/^:20:/m.test(roh)) return mt940Lesen(typeof daten === "string" ? daten : daten.toString("latin1"));
  throw new Error("Unbekanntes Dateiformat – bitte CAMT.053 (XML) oder MT940 (STA) verwenden.");
}

/** Eindeutiger Schlüssel je Umsatz (gegen doppelten Import überlappender Auszüge; die API speichert den SHA-256). `nr`: lfd. Nr. gleicher Umsätze in der Datei. */
export function umsatzSchluessel(kontoIban: string, u: Bankumsatz, nr: number): string {
  return [kontoIban, u.buchungsdatum, u.betrag, u.bankreferenz ?? "", u.endToEndId ?? "", u.name ?? "", u.verwendungszweck, nr].join("|");
}

/** Schlüssel für alle Umsätze einer Datei, gleiche Umsätze werden durchnummeriert. */
export function umsatzSchluesselListe(kontoIban: string, umsaetze: Bankumsatz[]): string[] {
  const zaehler = new Map<string, number>();
  return umsaetze.map((u) => {
    const basis = umsatzSchluessel(kontoIban, u, 0);
    const nr = zaehler.get(basis) ?? 0;
    zaehler.set(basis, nr + 1);
    return nr ? umsatzSchluessel(kontoIban, u, nr) : basis;
  });
}

// ------------------------------------------------------------------ Zuordnungsvorschläge

export type Sicherheit = "sicher" | "wahrscheinlich" | "moeglich";

export interface OffeneAnforderung {
  id: string;
  rechnungsnr: string;
  kaufvertragNr: string;
  offen: string;
  /** Namen der Käufer bzw. des Rechnungsempfängers */
  namen: string[];
  ibans: string[];
}

export interface OffenerZahlungslauf {
  id: string;
  nr: string;
  summe: string;
  ausfuehrungAm: string;
}

export interface OffenerZahlungsausgang {
  id: string;
  endToEndId: string;
  betrag: string;
  rechnungsnr: string;
  name: string;
}

export type Vorschlag =
  | { art: "anforderung"; sicherheit: Sicherheit; grund: string; posten: { id: string; rechnungsnr: string; betrag: string }[] }
  | { art: "zahlungslauf"; sicherheit: Sicherheit; grund: string; id: string; nr: string }
  | { art: "zahlungsausgang"; sicherheit: Sicherheit; grund: string; id: string; rechnungsnr: string };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const woerter = (s: string) => new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-zß]+/).filter((w) => w.length >= 3));
const nameTrifft = (u: Bankumsatz, namen: string[]) => {
  const w = woerter(`${u.name ?? ""} ${u.verwendungszweck}`);
  return namen.some((n) => [...woerter(n)].some((x) => w.has(x)));
};

/**
 * Bester Zuordnungsvorschlag für einen Umsatz.
 * Gutschriften: Rechnungsnummer im Verwendungszweck (auch mehrere), sonst Kaufvertragsnummer, sonst Betrag + Name/IBAN.
 * Belastungen: EndToEnd-ID aus dem Zahlungslauf, Nummer des Zahlungslaufs oder dessen Summe (Sammelbuchung).
 */
export function zuordnungVorschlag(u: Bankumsatz, offen: { anforderungen: OffeneAnforderung[]; zahlungslaeufe: OffenerZahlungslauf[]; zahlungsausgaenge: OffenerZahlungsausgang[] }): Vorschlag | null {
  const betrag = money(u.betrag);
  const text = norm(`${u.verwendungszweck} ${u.endToEndId ?? ""}`);
  if (betrag.isPositive()) {
    const genannt = offen.anforderungen.filter((a) => text.includes(norm(a.rechnungsnr)));
    if (genannt.length) {
      const summeOffen = summe(genannt.map((a) => money(a.offen)));
      if (genannt.length === 1) {
        const a = genannt[0]!;
        if (betrag.lte(a.offen))
          return { art: "anforderung", sicherheit: "sicher", grund: betrag.eq(a.offen) ? `Rechnungsnummer ${a.rechnungsnr}, Betrag passt` : `Rechnungsnummer ${a.rechnungsnr}, Teilzahlung`, posten: [{ id: a.id, rechnungsnr: a.rechnungsnr, betrag: betrag.toFixed(2) }] };
        // Überzahlung: nicht automatisch zuordnen, nur Hinweis
        return { art: "anforderung", sicherheit: "moeglich", grund: `Rechnungsnummer ${a.rechnungsnr}, aber Überzahlung (offen ${money(a.offen).toFixed(2).replace(".", ",")} €) – bitte klären`, posten: [] };
      }
      if (betrag.eq(summeOffen))
        return { art: "anforderung", sicherheit: "sicher", grund: `Rechnungsnummern ${genannt.map((a) => a.rechnungsnr).join(", ")}, Summe passt`, posten: genannt.map((a) => ({ id: a.id, rechnungsnr: a.rechnungsnr, betrag: money(a.offen).toFixed(2) })) };
    }
    const vertrag = offen.anforderungen.filter((a) => text.includes(norm(a.kaufvertragNr)));
    const passend = (l: OffeneAnforderung[]) => l.filter((a) => betrag.eq(a.offen));
    if (vertrag.length && passend(vertrag).length === 1) {
      const a = passend(vertrag)[0]!;
      return { art: "anforderung", sicherheit: "wahrscheinlich", grund: `Kaufvertrag ${a.kaufvertragNr}, Betrag passt zu ${a.rechnungsnr}`, posten: [{ id: a.id, rechnungsnr: a.rechnungsnr, betrag: betrag.toFixed(2) }] };
    }
    const gleicherBetrag = passend(offen.anforderungen);
    const mitName = gleicherBetrag.filter((a) => (u.iban && a.ibans.includes(u.iban)) || nameTrifft(u, a.namen));
    if (mitName.length === 1) {
      const a = mitName[0]!;
      return { art: "anforderung", sicherheit: "wahrscheinlich", grund: `Betrag und Auftraggeber passen zu ${a.rechnungsnr}`, posten: [{ id: a.id, rechnungsnr: a.rechnungsnr, betrag: betrag.toFixed(2) }] };
    }
    if (gleicherBetrag.length === 1) {
      const a = gleicherBetrag[0]!;
      return { art: "anforderung", sicherheit: "moeglich", grund: `nur der Betrag passt zu ${a.rechnungsnr}`, posten: [{ id: a.id, rechnungsnr: a.rechnungsnr, betrag: betrag.toFixed(2) }] };
    }
    return null;
  }
  const ab = betrag.negated();
  const e2e = u.endToEndId ? offen.zahlungsausgaenge.find((z) => z.endToEndId === u.endToEndId) : undefined;
  if (e2e) return { art: "zahlungsausgang", sicherheit: money(e2e.betrag).eq(ab) ? "sicher" : "wahrscheinlich", grund: `EndToEnd-ID ${e2e.endToEndId}`, id: e2e.id, rechnungsnr: e2e.rechnungsnr };
  const lauf = offen.zahlungslaeufe.find((l) => text.includes(norm(l.nr)));
  if (lauf) return { art: "zahlungslauf", sicherheit: money(lauf.summe).eq(ab) ? "sicher" : "wahrscheinlich", grund: `Zahlungslauf ${lauf.nr} im Verwendungszweck`, id: lauf.id, nr: lauf.nr };
  const laeufe = offen.zahlungslaeufe.filter((l) => money(l.summe).eq(ab));
  if (laeufe.length === 1) return { art: "zahlungslauf", sicherheit: "wahrscheinlich", grund: `Summe des Zahlungslaufs ${laeufe[0]!.nr}`, id: laeufe[0]!.id, nr: laeufe[0]!.nr };
  const einzeln = offen.zahlungsausgaenge.filter((z) => money(z.betrag).eq(ab) && (text.includes(norm(z.rechnungsnr)) || nameTrifft(u, [z.name])));
  if (einzeln.length === 1) return { art: "zahlungsausgang", sicherheit: "wahrscheinlich", grund: `Betrag und Empfänger passen zu Rechnung ${einzeln[0]!.rechnungsnr}`, id: einzeln[0]!.id, rechnungsnr: einzeln[0]!.rechnungsnr };
  return null;
}
