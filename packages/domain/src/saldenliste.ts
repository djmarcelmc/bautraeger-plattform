import { personenkonto, type JournalQuellen, type Kontierung } from "./buchhaltung.js";
import { csvLesen, textDekodieren } from "./import.js";
import { money, summe, ZERO, type Money } from "./money.js";

// Saldenliste der Personenkonten und Abgleich mit den offenen Posten aus Verkauf (Zahlungsanforderungen) und Kosten
// (freigegebene Rechnungen) – optional mit der Saldenliste aus DATEV als dritter Spalte.
// Salden werden einheitlich mit Vorzeichen geführt: Soll positiv (Forderung), Haben negativ (Verbindlichkeit).

export interface SaldoBuchung {
  konto: string;
  gegenkonto: string;
  betrag: string;
  sollHaben: "S" | "H";
  belegdatum: string;
}

/** Saldo je Konto bis zum Stichtag (Soll positiv). */
export function kontensalden(buchungen: SaldoBuchung[], stichtag: string): Map<string, Money> {
  const s = new Map<string, Money>();
  const add = (k: string, b: Money) => s.set(k, (s.get(k) ?? ZERO).plus(b));
  for (const x of buchungen) {
    if (x.belegdatum > stichtag) continue;
    const b = money(x.betrag);
    // S: Konto im Soll, Gegenkonto im Haben; H (Storno): umgekehrt
    const [soll, haben] = x.sollHaben === "S" ? [x.konto, x.gegenkonto] : [x.gegenkonto, x.konto];
    add(soll, b);
    add(haben, b.negated());
  }
  return s;
}

export interface OffenerPosten {
  konto: string;
  art: "debitor" | "kreditor";
  name: string;
  beleg: string;
  /** Soll positiv: Forderung (Debitor) positiv, Verbindlichkeit (Kreditor) negativ */
  offen: string;
  link: string;
}

/** Offene Posten je Personenkonto zum Stichtag, aus denselben Vorgängen wie das Journal. */
export function offenePosten(q: JournalQuellen, k: Kontierung, stichtag: string): OffenerPosten[] {
  const deb = (x: { debitorNr: number; debitorKonto?: string | null }) => x.debitorKonto || personenkonto(x.debitorNr, k.debitorBasis);
  const kred = (x: { kreditorNr: number; kreditorKonto?: string | null }) => x.kreditorKonto || personenkonto(x.kreditorNr, k.kreditorBasis);
  const liste: OffenerPosten[] = [];
  for (const a of q.anforderungen) {
    if (a.angefordertAm > stichtag) continue;
    const bezahlt = summe(q.eingaenge.filter((e) => e.zahlungsanforderungId === a.id && e.datum <= stichtag).map((e) => money(e.betrag)));
    const offen = money(a.betrag).minus(bezahlt);
    if (!offen.isZero()) liste.push({ konto: deb(a), art: "debitor", name: a.name, beleg: a.rechnungsnr, offen: offen.toFixed(2), link: `/zahlungsanforderungen/${a.id}` });
  }
  // Zahlungen ohne Anforderung mindern die Forderung (z. B. Vorauszahlungen)
  for (const e of q.eingaenge) {
    if (e.zahlungsanforderungId || e.datum > stichtag) continue;
    liste.push({ konto: deb(e), art: "debitor", name: e.name, beleg: "Zahlung ohne Anforderung", offen: money(e.betrag).negated().toFixed(2), link: "/verkauf" });
  }
  for (const r of q.rechnungen) {
    if (r.rechnungsdatum > stichtag) continue;
    const bezahlt = summe(q.ausgaenge.filter((z) => z.eingangsrechnungId === r.id && z.datum <= stichtag).map((z) => money(z.betrag).plus(z.skonto).plus(z.bauabzugsteuer)));
    const offen = money(r.betrag).minus(bezahlt);
    if (!offen.isZero()) liste.push({ konto: kred(r), art: "kreditor", name: r.name, beleg: r.rechnungsnr, offen: offen.negated().toFixed(2), link: `/eingangsrechnungen/${r.id}` });
  }
  return liste;
}

export interface SaldenZeile {
  konto: string;
  art: "debitor" | "kreditor";
  name: string;
  journal: string;
  op: string;
  datev: string | null;
  /** Journal − OP */
  differenzOp: string;
  /** Journal − DATEV (nur wenn DATEV-Saldo vorliegt) */
  differenzDatev: string | null;
  posten: OffenerPosten[];
}

/**
 * Saldenliste der Personenkonten: Journal-Saldo, Summe der offenen Posten und (optional) DATEV-Saldo je Konto.
 * Personenkonten sind Konten mit mehr Stellen als die Sachkontenlänge.
 */
export function saldenAbgleich(
  salden: Map<string, Money>,
  posten: OffenerPosten[],
  e: { sachkontenlaenge: number; kreditorBasis: number; namen?: Map<string, string>; datev?: Map<string, Money> },
): SaldenZeile[] {
  const konten = new Set<string>([...posten.map((p) => p.konto), ...[...salden.keys()].filter((k) => k.length > e.sachkontenlaenge), ...(e.datev ? e.datev.keys() : [])]);
  const zeilen: SaldenZeile[] = [];
  for (const konto of konten) {
    const eigene = posten.filter((p) => p.konto === konto);
    const journal = salden.get(konto) ?? ZERO;
    const op = summe(eigene.map((p) => money(p.offen)));
    const datev = e.datev?.get(konto) ?? (e.datev ? ZERO : null);
    if (journal.isZero() && op.isZero() && (!datev || datev.isZero())) continue;
    zeilen.push({
      konto,
      art: eigene[0]?.art ?? (Number(konto) >= e.kreditorBasis ? "kreditor" : "debitor"),
      name: eigene[0]?.name ?? e.namen?.get(konto) ?? "",
      journal: journal.toFixed(2),
      op: op.toFixed(2),
      datev: datev ? datev.toFixed(2) : null,
      differenzOp: journal.minus(op).toFixed(2),
      differenzDatev: datev ? journal.minus(datev).toFixed(2) : null,
      posten: eigene,
    });
  }
  return zeilen.sort((a, b) => a.art.localeCompare(b.art) || a.konto.localeCompare(b.konto));
}

const deZahl = (s: string) => {
  const t = s.replace(/\s|€/g, "");
  // 1.234,56 bzw. 1234,56 bzw. 1234.56
  const n = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^[-+]?\d+(\.\d+)?$/.test(n) ? money(n) : null;
};

/**
 * Saldenliste aus DATEV (CSV-Export der Summen- und Saldenliste bzw. OPOS-Saldenliste): erkennt die Spalten
 * „Konto“ und entweder „Saldo“ + „S/H“ oder getrennte Spalten „Saldo Soll“ / „Saldo Haben“. Ergebnis Soll positiv.
 */
export function datevSaldenLesen(daten: Uint8Array | string): { salden: Map<string, Money>; namen: Map<string, string>; fehler: string | null } {
  const text = typeof daten === "string" ? daten : textDekodieren(daten);
  const tabelle = csvLesen(text);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöü]/g, "");
  const kopfIndex = tabelle.findIndex((z) => z.some((c) => /^(konto|kontonummer|kontonr|personenkonto)$/.test(norm(c))));
  if (kopfIndex < 0) return { salden: new Map(), namen: new Map(), fehler: "Keine Spalte „Konto“ gefunden." };
  const kopf = tabelle[kopfIndex]!.map(norm);
  const spalte = (...muster: RegExp[]) => kopf.findIndex((c) => muster.some((m) => m.test(c)));
  const iKonto = spalte(/^(konto|kontonummer|kontonr|personenkonto)$/);
  const iName = spalte(/^(beschriftung|kontobeschriftung|name|bezeichnung|kontobezeichnung)$/);
  const iSoll = spalte(/^saldosoll|^endsaldosoll|^sollsaldo/);
  const iHaben = spalte(/^saldohaben|^endsaldohaben|^habensaldo/);
  const iSaldo = spalte(/^(saldo|endsaldo|saldoeur|saldo€|aktuellersaldo)$/);
  const iSh = spalte(/^(sh|sollhaben|kennzeichen|shkennzeichen|shsaldo)$/);
  if (iSaldo < 0 && (iSoll < 0 || iHaben < 0)) return { salden: new Map(), namen: new Map(), fehler: "Keine Saldo-Spalte gefunden (erwartet „Saldo“ mit „S/H“ oder „Saldo Soll“/„Saldo Haben“)." };
  const salden = new Map<string, Money>();
  const namen = new Map<string, string>();
  for (const z of tabelle.slice(kopfIndex + 1)) {
    const konto = (z[iKonto] ?? "").replace(/\D/g, "");
    if (!konto) continue;
    let saldo: Money | null;
    if (iSaldo >= 0) {
      saldo = deZahl(z[iSaldo] ?? "");
      const sh = (iSh >= 0 ? z[iSh] ?? "" : "").trim().toUpperCase();
      if (saldo && sh.startsWith("H")) saldo = saldo.abs().negated();
    } else {
      const s = deZahl(z[iSoll] ?? "") ?? ZERO;
      const h = deZahl(z[iHaben] ?? "") ?? ZERO;
      saldo = s.minus(h);
    }
    if (!saldo) continue;
    salden.set(konto, (salden.get(konto) ?? ZERO).plus(saldo));
    if (iName >= 0 && z[iName]) namen.set(konto, z[iName]!.trim());
  }
  return { salden, namen, fehler: salden.size ? null : "Keine Salden in der Datei gefunden." };
}
