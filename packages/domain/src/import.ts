import { EINHEIT_TYPEN, EinheitEingabe, PARTNER_ROLLEN, PartnerEingabe } from "./stammdaten.js";

// Datenübernahme aus Excel/CSV (Altbestand aus AMADEUS X, Excel-Listen o. Ä.)

export const IMPORT_ARTEN = ["partner", "einheiten"] as const;
export type ImportArt = (typeof IMPORT_ARTEN)[number];
export const IMPORT_ART_TEXT: Record<ImportArt, string> = { partner: "Geschäftspartner", einheiten: "Einheiten eines Projekts" };

export interface ImportSpalte {
  schluessel: string;
  titel: string;
  /** Weitere Überschriften, die als diese Spalte erkannt werden. */
  aliase?: string[];
  pflicht?: boolean;
  beispiel: string;
  hinweis?: string;
  /** Feste Auswahl (wird in der Excel-Vorlage als Liste hinterlegt). */
  auswahl?: readonly string[];
}

const ROLLE_TEXT: Record<(typeof PARTNER_ROLLEN)[number], string> = {
  kunde: "Kunde",
  interessent: "Interessent",
  handwerker: "Handwerker",
  lieferant: "Lieferant",
  notar: "Notar",
  makler: "Makler",
  bank: "Bank",
  sonstige: "Sonstige",
};
const TYP_TEXT: Record<(typeof EINHEIT_TYPEN)[number], string> = {
  wohnung: "Wohnung",
  stellplatz: "Stellplatz",
  gewerbe: "Gewerbe",
  hobbyraum: "Hobbyraum",
  sonstiges: "Sonstiges",
};

export const IMPORT_SPALTEN: Record<ImportArt, ImportSpalte[]> = {
  partner: [
    { schluessel: "nr", titel: "Nr.", aliase: ["Nummer", "Partnernummer", "Adressnummer", "Kundennummer"], beispiel: "10001", hinweis: "leer = nächste freie Nummer" },
    { schluessel: "suchcode", titel: "Suchcode", aliase: ["Suchbegriff", "Kurzname", "Matchcode"], beispiel: "MUSTERBAU", hinweis: "leer = aus Firma bzw. Name gebildet" },
    { schluessel: "firma", titel: "Firma", aliase: ["Firmenname", "Unternehmen", "Name 1"], beispiel: "Musterbau GmbH" },
    { schluessel: "anrede", titel: "Anrede", beispiel: "Herr" },
    { schluessel: "vorname", titel: "Vorname", beispiel: "Max" },
    { schluessel: "nachname", titel: "Nachname", aliase: ["Name", "Familienname", "Zuname"], beispiel: "Mustermann", hinweis: "Firma oder Nachname ist Pflicht" },
    { schluessel: "strasse", titel: "Straße", aliase: ["Strasse", "Anschrift", "Adresse"], beispiel: "Hauptstraße 1" },
    { schluessel: "plz", titel: "PLZ", aliase: ["Postleitzahl"], beispiel: "80331" },
    { schluessel: "ort", titel: "Ort", aliase: ["Stadt", "Wohnort"], beispiel: "München" },
    { schluessel: "email", titel: "E-Mail", aliase: ["Mail", "E-Mail-Adresse", "Email"], beispiel: "info@musterbau.de" },
    { schluessel: "telefon", titel: "Telefon", aliase: ["Tel", "Telefonnummer", "Mobil"], beispiel: "089 123456" },
    { schluessel: "iban", titel: "IBAN", beispiel: "DE02120300000000202051" },
    { schluessel: "bic", titel: "BIC", aliase: ["SWIFT"], beispiel: "BYLADEM1001" },
    {
      schluessel: "rollen",
      titel: "Rollen",
      aliase: ["Rolle", "Art", "Partnerart", "Kategorie"],
      pflicht: true,
      beispiel: "Handwerker, Lieferant",
      hinweis: `mehrere mit Komma: ${Object.values(ROLLE_TEXT).join(", ")}`,
    },
    {
      schluessel: "freistellungGueltigBis",
      titel: "Freistellung gültig bis",
      aliase: ["Freistellungsbescheinigung", "Freistellung", "§ 48b gültig bis"],
      beispiel: "31.12.2027",
      hinweis: "Datum TT.MM.JJJJ (nur Handwerker, § 48b EStG)",
    },
    { schluessel: "steuernummer", titel: "Steuernummer", aliase: ["StNr", "St.-Nr."], beispiel: "93815/08152", hinweis: "für die Bauabzugsteuer-Anmeldung" },
    { schluessel: "finanzamt", titel: "Finanzamt", aliase: ["zuständiges Finanzamt"], beispiel: "Stuttgart II" },
  ],
  einheiten: [
    { schluessel: "nr", titel: "Nr.", aliase: ["Nummer", "Einheit", "Einheitennr", "WE-Nr", "Whg-Nr"], pflicht: true, beispiel: "W01" },
    { schluessel: "typ", titel: "Typ", aliase: ["Einheitentyp", "Kategorie"], pflicht: true, beispiel: "Wohnung", auswahl: Object.values(TYP_TEXT) },
    { schluessel: "bauabschnitt", titel: "Bauabschnitt", aliase: ["BA", "Haus"], beispiel: "1", hinweis: "leer = 1" },
    { schluessel: "etage", titel: "Etage", aliase: ["Geschoss", "Lage", "Stockwerk"], beispiel: "1. OG" },
    { schluessel: "art", titel: "Art", aliase: ["Bezeichnung", "Beschreibung", "Zimmer"], beispiel: "3-Zimmer-Wohnung" },
    { schluessel: "wohnflaeche", titel: "Wohnfläche m²", aliase: ["Wohnfläche", "Fläche", "m²", "qm"], beispiel: "84,50" },
    { schluessel: "miteigentumTsd", titel: "MEA ‰", aliase: ["MEA", "Miteigentumsanteil", "Miteigentum", "Tausendstel"], beispiel: "92,125" },
    { schluessel: "preisProM2", titel: "Preis je m²", aliase: ["€/m²", "Preis pro m²", "Quadratmeterpreis"], beispiel: "5.900,00" },
    { schluessel: "vkBrutto", titel: "Verkaufspreis", aliase: ["VK", "Kaufpreis", "VK brutto", "Preis"], beispiel: "498.550,00" },
    { schluessel: "mindestVk", titel: "Mindest-VK", aliase: ["Mindestpreis", "Untergrenze"], beispiel: "480.000,00" },
    { schluessel: "zugehoerigZu", titel: "Gehört zu Nr.", aliase: ["Zugehörig zu", "zu Einheit", "Hauptwohnung"], beispiel: "", hinweis: "z. B. Stellplatz → Nr. der Wohnung" },
  ],
};

/** Überschrift vereinheitlichen: Kleinschreibung, Umlaute ausgeschrieben, nur Buchstaben/Ziffern. */
export function normalisiereUeberschrift(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/²/g, "2")
    .replace(/‰/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export interface Zuordnung {
  /** Spaltenindex der Datei → Feldschlüssel */
  spalten: Record<number, string>;
  erkannt: { titel: string; spalte: string }[];
  unbekannt: string[];
  fehlendePflicht: string[];
}

/** Ordnet die Kopfzeile der Datei den Importfeldern zu (exakte Überschrift oder bekannter Alias). */
export function spaltenZuordnen(art: ImportArt, kopf: string[]): Zuordnung {
  const felder = IMPORT_SPALTEN[art];
  const lexikon = new Map<string, ImportSpalte>();
  for (const f of felder) for (const n of [f.titel, f.schluessel, ...(f.aliase ?? [])]) lexikon.set(normalisiereUeberschrift(n), f);
  const z: Zuordnung = { spalten: {}, erkannt: [], unbekannt: [], fehlendePflicht: [] };
  const vergeben = new Set<string>();
  kopf.forEach((titel, i) => {
    if (!titel.trim()) return;
    const f = lexikon.get(normalisiereUeberschrift(titel));
    if (f && !vergeben.has(f.schluessel)) {
      vergeben.add(f.schluessel);
      z.spalten[i] = f.schluessel;
      z.erkannt.push({ titel: titel.trim(), spalte: f.titel });
    } else z.unbekannt.push(titel.trim());
  });
  z.fehlendePflicht = felder.filter((f) => f.pflicht && !vergeben.has(f.schluessel)).map((f) => f.titel);
  return z;
}

/** Deutsches Datum („31.12.2027“, „31.12.27“) oder ISO → JJJJ-MM-TT; sonst unverändert (die Prüfung meldet den Fehler). */
export function importDatum(s: string): string {
  const t = s.trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const jahr = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${jahr}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t;
}

function auswahlWert<T extends string>(texte: Record<T, string>, eingabe: string): T | string {
  const n = normalisiereUeberschrift(eingabe);
  for (const [schluessel, text] of Object.entries(texte) as [T, string][]) {
    if (normalisiereUeberschrift(schluessel) === n || normalisiereUeberschrift(text) === n) return schluessel;
  }
  // gängige Kurzformen und Mehrzahl
  const kurz: Record<string, string> = { whg: "wohnung", wohnungen: "wohnung", tg: "stellplatz", tgstellplatz: "stellplatz", garage: "stellplatz", kunden: "kunde", kaeufer: "kunde", handwerk: "handwerker", nu: "handwerker", nachunternehmer: "handwerker" };
  return kurz[n] ?? eingabe.trim();
}

/** Suchcode aus Firma oder Name: Großbuchstaben, Umlaute ausgeschrieben, höchstens 20 Zeichen. */
export function suchcodeVorschlag(firma?: string | null, nachname?: string | null): string {
  const quelle = (firma || nachname || "").replace(/\b(gmbh|ag|kg|ug|mbh|co|e\.?\s?k|gbr|ohg)\b\.?/gi, "");
  return normalisiereUeberschrift(quelle).toUpperCase().slice(0, 20);
}

export type ImportStatus = "neu" | "aktualisieren" | "unveraendert" | "fehler";

export interface ImportZeile {
  /** Zeilennummer in der Datei (1 = Kopfzeile) */
  zeile: number;
  status: ImportStatus;
  /** Eindeutiger Schlüssel (Partner-Nr. bzw. Einheiten-Nr.) */
  schluessel: string;
  bezeichnung: string;
  fehler: string[];
  /** Geprüfte Werte (nur ohne Fehler) */
  werte?: Record<string, unknown>;
  /** Einheiten: Nr. der zugehörigen Einheit */
  zugehoerigZu?: string | null;
}

export interface ImportPruefung {
  art: ImportArt;
  zuordnung: Zuordnung;
  zeilen: ImportZeile[];
  anzahl: Record<ImportStatus, number>;
  /** true, wenn ohne Fehler übernommen werden kann */
  bereit: boolean;
}

export interface Vorhanden {
  /** Partner: Nr. → Suchcode; Einheiten: Nr. → Nr. */
  schluessel: Map<string, Record<string, unknown>>;
  /** Partner: höchste vergebene Nummer */
  hoechsteNr?: number;
}

const leer = (v: string | undefined) => v === undefined || v.trim() === "";

function ersterFehler(fehler: { path: PropertyKey[]; message: string }[], art: ImportArt): string[] {
  const titel = new Map(IMPORT_SPALTEN[art].map((s) => [s.schluessel, s.titel]));
  return fehler.map((f) => {
    const feld = String(f.path[0] ?? "");
    return titel.has(feld) ? `${titel.get(feld)}: ${f.message}` : f.message;
  });
}

/** Vergleicht neue Werte mit dem Bestand (nur die importierten Felder). */
function gleich(neu: Record<string, unknown>, alt: Record<string, unknown>): boolean {
  const norm = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    if (Array.isArray(v)) return [...v].sort().join(",");
    if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return String(Number(v));
    if (typeof v === "number") return String(v);
    return String(v);
  };
  return Object.keys(neu).every((k) => norm(neu[k]) === norm(alt[k]));
}

/**
 * Prüft alle Datenzeilen: Pflichtfelder, Formate, doppelte Schlüssel in der Datei und Abgleich mit dem Bestand.
 * Vorhandene Datensätze werden nur mit `aktualisieren` überschrieben, sonst als Fehler gemeldet.
 */
export function importPruefen(art: ImportArt, tabelle: string[][], vorhanden: Vorhanden, optionen: { aktualisieren?: boolean } = {}): ImportPruefung {
  const [kopf = [], ...daten] = tabelle;
  const zuordnung = spaltenZuordnen(art, kopf);
  const zeilen: ImportZeile[] = [];
  const gesehen = new Map<string, number>();
  let naechsteNr = (vorhanden.hoechsteNr ?? 10000) + 1;
  const belegteNr = new Set([...vorhanden.schluessel.keys()]);
  // Partner-Nummern aus der Datei vorab reservieren, damit automatisch vergebene nicht kollidieren
  if (art === "partner") {
    const nrSpalte = Object.entries(zuordnung.spalten).find(([, s]) => s === "nr")?.[0];
    if (nrSpalte !== undefined) for (const z of daten) if (!leer(z[Number(nrSpalte)])) belegteNr.add(String(Number(z[Number(nrSpalte)])));
  }

  daten.forEach((zelle, i) => {
    const zeile = i + 2;
    if (zelle.every((c) => leer(c))) return;
    const roh: Record<string, string> = {};
    for (const [idx, schluessel] of Object.entries(zuordnung.spalten)) roh[schluessel] = (zelle[Number(idx)] ?? "").trim();

    let eingabe: Record<string, unknown>;
    let schluessel: string;
    let bezeichnung: string;
    let zugehoerigZu: string | null = null;
    const fehler: string[] = [];

    if (art === "partner") {
      if (leer(roh.nr)) {
        while (belegteNr.has(String(naechsteNr))) naechsteNr++;
        roh.nr = String(naechsteNr);
        belegteNr.add(roh.nr);
      }
      if (leer(roh.suchcode)) roh.suchcode = suchcodeVorschlag(roh.firma, roh.nachname);
      const rollen = (roh.rollen ?? "")
        .split(/[,;/|]+/)
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => auswahlWert(ROLLE_TEXT, r));
      eingabe = { ...roh, rollen, iban: roh.iban ?? "", bic: roh.bic ?? "", freistellungGueltigBis: importDatum(roh.freistellungGueltigBis ?? "") };
      schluessel = String(Number(roh.nr) || roh.nr);
      bezeichnung = [roh.firma, [roh.vorname, roh.nachname].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || roh.suchcode || "";
    } else {
      zugehoerigZu = leer(roh.zugehoerigZu) ? null : roh.zugehoerigZu!;
      const { zugehoerigZu: _z, ...rest } = roh;
      void _z;
      eingabe = { ...rest, typ: auswahlWert(TYP_TEXT, roh.typ ?? ""), bauabschnitt: roh.bauabschnitt ?? "" };
      schluessel = roh.nr ?? "";
      bezeichnung = [TYP_TEXT[eingabe.typ as keyof typeof TYP_TEXT] ?? roh.typ, roh.etage, roh.art].filter(Boolean).join(" · ");
    }

    const ergebnis = (art === "partner" ? PartnerEingabe : EinheitEingabe).safeParse(eingabe);
    if (!ergebnis.success) fehler.push(...ersterFehler(ergebnis.error.issues, art));

    if (schluessel) {
      const frueher = gesehen.get(schluessel);
      if (frueher) fehler.push(`Nr. ${schluessel} steht schon in Zeile ${frueher}`);
      else gesehen.set(schluessel, zeile);
    }

    let status: ImportStatus = "neu";
    const alt = vorhanden.schluessel.get(schluessel);
    if (alt && !fehler.length) {
      const vergleich = art === "einheiten" ? { ...(ergebnis.data as Record<string, unknown>), zugehoerigZu } : (ergebnis.data as Record<string, unknown>);
      if (gleich(vergleich, alt)) status = "unveraendert";
      else if (optionen.aktualisieren) status = "aktualisieren";
      else fehler.push(`Nr. ${schluessel} ist bereits vorhanden (zum Überschreiben „Vorhandene aktualisieren“ wählen)`);
    }
    if (fehler.length) status = "fehler";
    zeilen.push({ zeile, status, schluessel, bezeichnung, fehler, werte: fehler.length ? undefined : (ergebnis.data as Record<string, unknown>), zugehoerigZu });
  });

  // Einheiten: Bezug „Gehört zu Nr.“ muss in der Datei oder im Bestand existieren
  if (art === "einheiten") {
    for (const z of zeilen) {
      if (!z.zugehoerigZu) continue;
      if (z.zugehoerigZu === z.schluessel) z.fehler.push("Eine Einheit kann nicht zu sich selbst gehören");
      else if (!gesehen.has(z.zugehoerigZu) && !vorhanden.schluessel.has(z.zugehoerigZu)) z.fehler.push(`Gehört zu Nr.: Einheit „${z.zugehoerigZu}“ gibt es weder in der Datei noch im Projekt`);
      if (z.fehler.length) {
        z.status = "fehler";
        z.werte = undefined;
      }
    }
  }

  const anzahl: Record<ImportStatus, number> = { neu: 0, aktualisieren: 0, unveraendert: 0, fehler: 0 };
  for (const z of zeilen) anzahl[z.status]++;
  const kopfFehler = zuordnung.fehlendePflicht.length > 0;
  return { art, zuordnung, zeilen, anzahl, bereit: !kopfFehler && anzahl.fehler === 0 && anzahl.neu + anzahl.aktualisieren > 0 };
}

/** Liest CSV-Text (Trennzeichen ; , oder Tab werden erkannt, Anführungszeichen nach RFC 4180). */
export function csvLesen(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const ersteZeile = t.slice(0, t.search(/\r?\n|$/));
  const kandidaten = [";", ",", "\t"];
  const trenner = kandidaten.reduce((a, b) => (ersteZeile.split(b).length > ersteZeile.split(a).length ? b : a));
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = "";
  let inAnf = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inAnf) {
      if (c === '"' && t[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (c === '"') inAnf = false;
      else feld += c;
    } else if (c === '"' && feld === "") inAnf = true;
    else if (c === trenner) {
      zeile.push(feld);
      feld = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = "";
    } else feld += c;
  }
  if (feld !== "" || zeile.length) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen;
}

/** Bytes als UTF-8 lesen; ist das kein gültiges UTF-8 (typisch Excel-CSV unter Windows), als Windows-1252. */
export function textDekodieren(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
