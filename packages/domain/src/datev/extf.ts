import iconv from "iconv-lite";
import { Money, cent } from "../money.js";

/**
 * Export eines Buchungsstapels im DATEV-Format (EXTF, Formatversion 700, Kategorie 21).
 *
 * WICHTIG: Kopfzeile und Spaltenpositionen vor dem Produktiveinsatz gegen die offizielle
 * DATEV-Formatbeschreibung „Buchungsstapel“ prüfen und mit dem Steuerberater testen.
 * Exportiert werden die Spalten 1–39 (bis „Kost-Menge“); weitere Spalten bleiben leer.
 */

export interface ExtfKopf {
  beraternummer: number;
  mandantennummer: number;
  /** Beginn des Wirtschaftsjahres. */
  wjBeginn: Date;
  sachkontenlaenge: number;
  datumVon: Date;
  datumBis: Date;
  bezeichnung: string;
  diktatkuerzel?: string;
  /** "03" oder "04" */
  skr?: string;
  festschreibung?: boolean;
  erzeugtAm?: Date;
}

export interface ExtfBuchung {
  /** Betrag immer positiv; Richtung über sollHaben. */
  umsatz: Money;
  sollHaben: "S" | "H";
  konto: string;
  gegenkonto: string;
  buSchluessel?: string;
  belegdatum: Date;
  belegfeld1?: string;
  belegfeld2?: string;
  buchungstext?: string;
  beleglink?: string;
  /** Kostenstelle 1 – bei uns die Projektnummer. */
  kost1?: string;
  kost2?: string;
}

const SPALTEN = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
  "Postensperre",
  "Diverse Adressnummer",
  "Geschäftspartnerbank",
  "Sachverhalt",
  "Zinssperre",
  "Beleglink",
  ...Array.from({ length: 8 }, (_, i) => [`Beleginfo - Art ${i + 1}`, `Beleginfo - Inhalt ${i + 1}`]).flat(),
  "KOST1 - Kostenstelle",
  "KOST2 - Kostenstelle",
  "Kost-Menge",
];

const pad = (n: number, l = 2) => String(n).padStart(l, "0");
const yyyymmdd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const zeitstempel = (d: Date) =>
  `${yyyymmdd(d)}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
/** Text in Anführungszeichen; Anführungszeichen im Text werden verdoppelt. */
const txt = (s: string | undefined, max?: number) => {
  if (s === undefined || s === "") return "";
  const t = max ? s.slice(0, max) : s;
  return `"${t.replace(/"/g, '""')}"`;
};
const betrag = (m: Money) => cent(m).toFixed(2).replace(".", ",");

export function extfKopfzeile(k: ExtfKopf): string {
  const felder = [
    txt("EXTF"),
    "700",
    "21",
    txt("Buchungsstapel"),
    "13",
    zeitstempel(k.erzeugtAm ?? new Date()),
    "",
    txt("RE"),
    "",
    "",
    String(k.beraternummer),
    String(k.mandantennummer),
    yyyymmdd(k.wjBeginn),
    String(k.sachkontenlaenge),
    yyyymmdd(k.datumVon),
    yyyymmdd(k.datumBis),
    txt(k.bezeichnung, 30),
    txt(k.diktatkuerzel, 2),
    "1",
    "0",
    k.festschreibung ? "1" : "0",
    txt("EUR"),
    "",
    "",
    "",
    "",
    txt(k.skr ?? "03"),
    "",
    "",
    "",
    "",
  ];
  return felder.join(";");
}

export function extfZeile(b: ExtfBuchung): string {
  if (b.umsatz.isNegative() || b.umsatz.isZero())
    throw new Error("Umsatz muss positiv sein; Richtung über Soll/Haben-Kennzeichen angeben.");
  const zeile = new Array<string>(SPALTEN.length).fill("");
  zeile[0] = betrag(b.umsatz);
  zeile[1] = txt(b.sollHaben);
  zeile[2] = txt("EUR");
  zeile[6] = b.konto;
  zeile[7] = b.gegenkonto;
  zeile[8] = txt(b.buSchluessel);
  zeile[9] = `${pad(b.belegdatum.getDate())}${pad(b.belegdatum.getMonth() + 1)}`;
  zeile[10] = txt(b.belegfeld1, 36);
  zeile[11] = txt(b.belegfeld2, 12);
  zeile[13] = txt(b.buchungstext, 60);
  zeile[19] = txt(b.beleglink, 210);
  zeile[36] = txt(b.kost1, 36);
  zeile[37] = txt(b.kost2, 36);
  return zeile.join(";");
}

/** Erzeugt die komplette Datei als Text (CRLF-Zeilenenden). */
export function extfBuchungsstapelText(kopf: ExtfKopf, buchungen: ExtfBuchung[]): string {
  return [extfKopfzeile(kopf), SPALTEN.join(";"), ...buchungen.map(extfZeile)].join("\r\n") + "\r\n";
}

/** Erzeugt die Datei in Windows-1252-Kodierung, wie DATEV sie erwartet. */
export function extfBuchungsstapel(kopf: ExtfKopf, buchungen: ExtfBuchung[]): Buffer {
  return iconv.encode(extfBuchungsstapelText(kopf, buchungen), "win1252");
}
