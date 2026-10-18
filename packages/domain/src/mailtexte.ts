import { z } from "zod";
import type { Aufgabe } from "./cockpit.js";

export interface Mail {
  betreff: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const de = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
const eur = (v: string) => `${Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Schlichtes, mailclient-taugliches HTML (Inline-Stile, keine externen Ressourcen). */
function huelle(titel: string, absaetze: string[], fuss: string) {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f6f7f9;font-family:Segoe UI,Arial,sans-serif;color:#111827">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#fff;border:1px solid #e5e8ed;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(titel)}</h1>
${absaetze.join("\n")}
</div>
<p style="color:#8a93a3;font-size:12px;margin:12px 4px">${esc(fuss)}</p>
</div></body></html>`;
}
const p = (s: string) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${s}</p>`;
const zeilen = (paare: [string, string | null | undefined][]) =>
  `<table style="font-size:14px;border-collapse:collapse;margin:0 0 12px">${paare
    .filter(([, w]) => w)
    .map(([k, w]) => `<tr><td style="color:#4b5563;padding:3px 16px 3px 0;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(w!).replace(/\n/g, "<br>")}</td></tr>`)
    .join("")}</table>`;
const textZeilen = (paare: [string, string | null | undefined][]) => paare.filter(([, w]) => w).map(([k, w]) => `${k}: ${w}`).join("\n");

export interface MangelMailDaten {
  bautraeger: string;
  projekt: string;
  nr: string;
  titel: string;
  ort?: string | null;
  einheit?: string | null;
  beschreibung?: string | null;
  kaeufer?: string | null;
  fotos?: number;
}

/** An die Bauleitung: neue Mängelanzeige über das Käuferportal. */
export function mailMangelGemeldet(m: MangelMailDaten, link: string): Mail {
  const paare: [string, string | null | undefined][] = [
    ["Projekt", m.projekt],
    ["Einheit", m.einheit],
    ["Käufer", m.kaeufer],
    ["Mangel", m.titel],
    ["Stelle", m.ort],
    ["Beschreibung", m.beschreibung],
    ["Fotos", m.fotos ? String(m.fotos) : null],
  ];
  return {
    betreff: `Neue Mängelanzeige ${m.nr}: ${m.titel}`,
    text: `Über das Käuferportal ist eine neue Mängelanzeige eingegangen.\n\n${textZeilen(paare)}\n\nZur Bearbeitung: ${link}`,
    html: huelle(
      `Neue Mängelanzeige ${m.nr}`,
      [p("Über das Käuferportal ist eine neue Mängelanzeige eingegangen."), zeilen(paare), p(`<a href="${esc(link)}" style="color:#2563eb">Mangel öffnen und Handwerker zuordnen</a>`)],
      `${m.bautraeger} · automatische Benachrichtigung der Bauträger-Plattform`,
    ),
  };
}

/** An den Käufer: Eingangsbestätigung. */
export function mailMangelEingang(m: MangelMailDaten, anrede: string): Mail {
  return {
    betreff: `Ihre Mängelanzeige Nr. ${m.nr} ist eingegangen`,
    text: `${anrede},\n\nvielen Dank für Ihre Meldung „${m.titel}“${m.ort ? ` (${m.ort})` : ""}. Wir prüfen den Mangel und melden uns zur Terminabstimmung.\nDen Bearbeitungsstand sehen Sie jederzeit über Ihren persönlichen Link.\n\nMit freundlichen Grüßen\n${m.bautraeger}`,
    html: huelle(
      "Ihre Mängelanzeige ist eingegangen",
      [
        p(`${esc(anrede)},`),
        p(`vielen Dank für Ihre Meldung <b>„${esc(m.titel)}“</b>${m.ort ? ` (${esc(m.ort)})` : ""}. Wir prüfen den Mangel und melden uns zur Terminabstimmung.`),
        p("Den Bearbeitungsstand sehen Sie jederzeit über Ihren persönlichen Link."),
        p(`Mit freundlichen Grüßen<br>${esc(m.bautraeger)}`),
      ],
      `${m.bautraeger} · ${m.projekt} · Meldung Nr. ${m.nr}`,
    ),
  };
}

/** An den Käufer: Statuswechsel (in Bearbeitung / erledigt). */
export function mailMangelStatus(m: MangelMailDaten, anrede: string, status: "in_bearbeitung" | "erledigt", erledigtAm?: string | null): Mail {
  const satz =
    status === "erledigt"
      ? `der von Ihnen gemeldete Mangel „${m.titel}“ wurde${erledigtAm ? ` am ${de(erledigtAm)}` : ""} als erledigt gemeldet. Sollte der Mangel weiterhin bestehen, teilen Sie uns dies bitte über Ihren persönlichen Link mit.`
      : `der von Ihnen gemeldete Mangel „${m.titel}“ ist jetzt in Bearbeitung. Der zuständige Handwerksbetrieb ist beauftragt; wir bzw. der Betrieb melden uns zur Terminabstimmung.`;
  return {
    betreff: `Mängelanzeige Nr. ${m.nr}: ${status === "erledigt" ? "erledigt" : "in Bearbeitung"}`,
    text: `${anrede},\n\n${satz}\n\nMit freundlichen Grüßen\n${m.bautraeger}`,
    html: huelle(status === "erledigt" ? "Mangel erledigt" : "Mangel in Bearbeitung", [p(`${esc(anrede)},`), p(esc(satz)), p(`Mit freundlichen Grüßen<br>${esc(m.bautraeger)}`)], `${m.bautraeger} · ${m.projekt} · Meldung Nr. ${m.nr}`),
  };
}

/** Tägliche Übersicht der Aufgaben aus dem Cockpit. */
export function mailAufgaben(aufgaben: Aufgabe[], basisUrl: string, datum: string): Mail | null {
  const relevant = aufgaben.filter((a) => a.dringlichkeit !== "info");
  if (!relevant.length) return null;
  const hoch = relevant.filter((a) => a.dringlichkeit === "hoch").length;
  const zeile = (a: Aufgabe) => `${a.titel}${a.projekt ? ` (${a.projekt})` : ""}${a.betrag ? ` – ${eur(a.betrag)}` : ""}${a.datum ? ` – ${de(a.datum)}` : ""}`;
  const url = (link: string) => `${basisUrl.replace(/\/$/, "")}${link}`;
  return {
    betreff: `Aufgaben am ${de(datum)}: ${hoch} dringend, ${relevant.length - hoch} demnächst`,
    text: `Aufgaben am ${de(datum)}\n\n${relevant.map((a) => `${a.dringlichkeit === "hoch" ? "[dringend] " : "- "}${zeile(a)}\n  ${a.text}\n  ${url(a.link)}`).join("\n\n")}\n\nCockpit: ${url("/")}`,
    html: huelle(
      `Aufgaben am ${de(datum)}`,
      [
        p(`<b>${hoch}</b> dringend · <b>${relevant.length - hoch}</b> demnächst`),
        `<ul style="list-style:none;padding:0;margin:0 0 12px">${relevant
          .map(
            (a) =>
              `<li style="border-left:4px solid ${a.dringlichkeit === "hoch" ? "#dc2626" : "#b45309"};padding:6px 10px;margin:0 0 8px;background:#f9fafb"><a href="${esc(url(a.link))}" style="color:#111827;font-weight:600;text-decoration:none">${esc(zeile(a))}</a><br><span style="color:#4b5563;font-size:13px">${esc(a.text)}</span></li>`,
          )
          .join("")}</ul>`,
        p(`<a href="${esc(url("/"))}" style="color:#2563eb">Zum Cockpit</a>`),
      ],
      "Tägliche Übersicht der Bauträger-Plattform · Empfänger in den Einstellungen änderbar",
    ),
  };
}

// ---------------------------------------------------------------- Einstellungen

const adressen = z.preprocess(
  (v) => (typeof v === "string" ? v.split(/[,;\s]+/).filter(Boolean) : (v ?? [])),
  z.array(z.email("Ungültige E-Mail-Adresse")).max(20, "Höchstens 20 Empfänger"),
);

export const BenachrichtigungEinstellung = z.object({
  maengelAn: adressen,
  aufgabenAn: adressen,
  kaeuferInformieren: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(true),
});
export type BenachrichtigungEinstellung = z.infer<typeof BenachrichtigungEinstellung>;
export const BENACHRICHTIGUNG_STANDARD: BenachrichtigungEinstellung = { maengelAn: [], aufgabenAn: [], kaeuferInformieren: true };

export const TestmailEingabe = z.object({ an: z.email("Ungültige E-Mail-Adresse") });

/** Wartezeit bis zum nächsten Versuch: 1, 5, 30 Minuten, 2 und 12 Stunden. */
export const WIEDERHOLUNG_MINUTEN = [1, 5, 30, 120, 720] as const;

// ---------------------------------------------------------------- Schreiben per E-Mail (PDF im Anhang)

export const SCHREIBEN_ARTEN = ["zahlungsanforderung", "mahnung", "sonderwunsch"] as const;
export type SchreibenArt = (typeof SCHREIBEN_ARTEN)[number];

export interface SchreibenDaten {
  bautraeger: string;
  /** z. B. „Sehr geehrter Herr Beispiel“ */
  anrede: string;
  /** „LINDENWEG, Wohneinheit 02“ */
  objekt: string;
  /** Rechnungsnummer bzw. Angebots-Nr. */
  nummer: string;
  betrag: string;
  /** Fälligkeit, Mahnfrist bzw. Angebotsgültigkeit */
  frist?: string | null;
  /** Mahnstufe („Zahlungserinnerung“) bzw. Leistung des Sonderwunschs */
  titel?: string;
  gutschrift?: boolean;
  nurSonderleistungen?: boolean;
}

/** Vorschlag für Betreff und Text der Begleitmail; beides kann vor dem Versand angepasst werden. */
export function schreibenVorlage(art: SchreibenArt, d: SchreibenDaten): { betreff: string; text: string; dateiname: string } {
  const gruss = `\n\nDas Schreiben finden Sie als PDF im Anhang.\n\nMit freundlichen Grüßen\n${d.bautraeger}`;
  const sicher = (s: string) => s.replace(/[^\wäöüÄÖÜß.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (art === "zahlungsanforderung") {
    const was = d.nurSonderleistungen ? "Rechnung über Sonderleistungen" : "Zahlungsanforderung";
    return {
      betreff: `${was} ${d.nummer} – Bauvorhaben ${d.objekt}`,
      text: `${d.anrede},\n\nanbei erhalten Sie unsere ${was} ${d.nummer} über ${eur(d.betrag)}.${d.frist ? ` Bitte überweisen Sie den Betrag bis zum ${de(d.frist)} unter Angabe der Rechnungsnummer.` : ""}${gruss}`,
      dateiname: `${sicher(d.nummer)}.pdf`,
    };
  }
  if (art === "mahnung") {
    const titel = d.titel ?? "Mahnung";
    return {
      betreff: `${titel} zu ${d.nummer} – Bauvorhaben ${d.objekt}`,
      text: `${d.anrede},\n\nzu unserer Rechnung ${d.nummer} ist noch ein Betrag von ${eur(d.betrag)} offen. Bitte gleichen Sie ihn${d.frist ? ` bis zum ${de(d.frist)}` : ""} aus. Sollten Sie inzwischen gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.${gruss}`,
      dateiname: `${sicher(titel)}-${sicher(d.nummer)}.pdf`,
    };
  }
  const leistung = d.titel ?? "Sonderwunsch";
  return d.gutschrift
    ? {
        betreff: `Gutschrift: ${leistung} – Bauvorhaben ${d.objekt}`,
        text: `${d.anrede},\n\nwie besprochen entfällt die Leistung „${leistung}“. Wir schreiben Ihnen dafür ${eur(d.betrag)} gut; der Betrag wird mit der nächsten Zahlungsanforderung verrechnet. Bitte senden Sie uns die Einverständniserklärung unterschrieben zurück.${gruss}`,
        dateiname: `Gutschrift-${sicher(d.nummer)}.pdf`,
      }
    : {
        betreff: `Angebot: ${leistung} – Bauvorhaben ${d.objekt}`,
        text: `${d.anrede},\n\nanbei erhalten Sie unser Angebot für „${leistung}“ zum Preis von ${eur(d.betrag)}. Zur Beauftragung senden Sie uns bitte die unterschriebene Auftragserteilung zurück${d.frist ? ` – das Angebot gilt bis zum ${de(d.frist)}` : ""}.${gruss}`,
        dateiname: `Angebot-Sonderwunsch-${sicher(d.nummer)}.pdf`,
      };
}

/** Begleitmail aus (ggf. bearbeitetem) Text: Absätze werden zu HTML. */
export function mailAusText(betreff: string, text: string, fuss: string): Mail {
  const absaetze = text
    .trim()
    .split(/\n{2,}/)
    .map((a) => p(esc(a).replace(/\n/g, "<br>")));
  return { betreff, text: text.trim(), html: huelle(betreff, absaetze, fuss) };
}

export const SchreibenVersandEingabe = z.object({
  an: z
    .string()
    .transform((s) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.email("Ungültige E-Mail-Adresse")).min(1, "Mindestens einen Empfänger angeben").max(10, "Höchstens 10 Empfänger")),
  betreff: z.string().trim().min(1, "Betreff angeben").max(200),
  text: z.string().trim().min(1, "Text angeben").max(10000),
});

/** Briefanrede aus Anrede und Nachname. */
export const briefAnrede = (p?: { anrede?: string | null; nachname?: string | null } | null) =>
  p?.anrede === "Frau" && p.nachname ? `Sehr geehrte Frau ${p.nachname}` : p?.anrede === "Herr" && p.nachname ? `Sehr geehrter Herr ${p.nachname}` : "Sehr geehrte Damen und Herren";

// ---------------------------------------------------------------- DATEV-Export an den Steuerberater

export interface DatevExportMailDaten {
  gesellschaft: string;
  beraternr: number;
  mandantennr: number;
  stapel: string;
  von: string;
  bis: string;
  anzahl: number;
  dateiname: string;
  /** ZIP mit Stapel, Belegen und Belegliste */
  belegeLink: string;
  /** Übersicht für den Steuerberater (Saldenliste, Bauabzugsteuer) */
  uebersichtLink: string;
  /** Erneuter Versand eines früheren Stapels */
  erneut?: boolean;
}

/** An den Steuerberater: Buchungsstapel (EXTF) im Anhang, Belege als Link. */
export function mailDatevExport(d: DatevExportMailDaten): Mail {
  const zeitraum = `${de(d.von)} – ${de(d.bis)}`;
  const paare: [string, string | null | undefined][] = [
    ["Gesellschaft", d.gesellschaft],
    ["Berater / Mandant", `${d.beraternr} / ${d.mandantennr}`],
    ["Zeitraum", zeitraum],
    ["Buchungen", String(d.anzahl)],
    ["Stapel", d.stapel],
    ["Anhang", d.dateiname],
  ];
  const einleitung = `${d.erneut ? "erneut " : ""}anbei der Buchungsstapel aus der Bauträger-Plattform im DATEV-Format (EXTF) zum Import in DATEV Rechnungswesen.`;
  const belege = "Die Belege (Rechnungsscans, Zahlungsanforderungen, Bauabzug-Abrechnungen) mit Belegliste stehen als ZIP-Datei zum Herunterladen bereit";
  const festgeschrieben = "Die Buchungen sind mit dem Export festgeschrieben; spätere Änderungen kommen als Storno- und Neubuchung im nächsten Stapel.";
  return {
    betreff: `DATEV-Buchungsstapel ${d.gesellschaft}: ${zeitraum} (${d.anzahl} Buchungen)${d.erneut ? " – erneut" : ""}`,
    text: `Guten Tag,\n\n${einleitung}\n\n${textZeilen(paare)}\n\n${belege}:\n${d.belegeLink}\n\n${festgeschrieben}\n\nSaldenliste, offene Posten und Bauabzugsteuer: ${d.uebersichtLink}`,
    html: huelle(
      `DATEV-Buchungsstapel ${d.gesellschaft}`,
      [
        p(`Guten Tag,`),
        p(esc(einleitung)),
        zeilen(paare),
        p(`${esc(belege)}: <a href="${esc(d.belegeLink)}" style="color:#2563eb">ZIP mit Belegen herunterladen</a>`),
        p(esc(festgeschrieben)),
        p(`<a href="${esc(d.uebersichtLink)}" style="color:#2563eb">Saldenliste, offene Posten und Bauabzugsteuer</a>`),
      ],
      `${d.gesellschaft} · automatischer Versand der Bauträger-Plattform`,
    ),
  };
}
