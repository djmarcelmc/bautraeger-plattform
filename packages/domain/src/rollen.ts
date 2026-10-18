/**
 * Rollen (App-Rollen in Microsoft Entra ID, siehe docs/microsoft-entra-app-registrierung.md) und Rechte.
 * Die API setzt die Rechte durch; die Oberfläche blendet nur zusätzlich aus.
 */
export const ROLLEN = {
  "Bautraeger.Admin": "Administrator",
  "Bautraeger.Geschaeftsfuehrung": "Geschäftsführung",
  "Bautraeger.Buchhaltung": "Buchhaltung",
  "Bautraeger.Vertrieb": "Vertrieb",
  "Bautraeger.Bauleitung": "Bauleitung",
  "Bautraeger.Steuerberater": "Steuerberater",
  /** Technischer Lesezugriff (MCP-Server, Hintergrunddienste). */
  "System.Lesen": "System (nur lesen)",
} as const;
export type Rolle = keyof typeof ROLLEN;

export const RECHTE = {
  lesen: "Daten ansehen",
  stammdaten: "Geschäftspartner anlegen und ändern",
  projekte: "Projekte und Einheiten pflegen",
  verkauf: "Kaufverträge, Raten und Zahlungsanforderungen",
  verkaufZahlungen: "Zahlungseingänge und Mahnungen",
  bau: "Bautenstand, Bauzeitenplan, Mängel und Abnahmen",
  kostenBearbeiten: "Gewerke, Handwerkerverträge und Nachträge",
  kostenPruefen: "Rechnungen erfassen und prüfen",
  kostenFreigeben: "Rechnungen freigeben",
  zahlungen: "Rechnungen bezahlen und Zahlungsläufe",
  sicherheiten: "Bürgschaften",
  buchhaltung: "Buchungsjournal, Kontenzuordnung und DATEV-Export",
  dokumente: "Dokumente hochladen und ausblenden",
  verwaltung: "Gesellschaften und Einstellungen",
} as const;
export type Recht = keyof typeof RECHTE;

const ALLE_FACHLICHEN: Rolle[] = ["Bautraeger.Admin", "Bautraeger.Geschaeftsfuehrung", "Bautraeger.Buchhaltung", "Bautraeger.Vertrieb", "Bautraeger.Bauleitung"];
const LEITUNG: Rolle[] = ["Bautraeger.Admin", "Bautraeger.Geschaeftsfuehrung"];

export const RECHTE_JE_ROLLE: Record<Recht, Rolle[]> = {
  lesen: [...ALLE_FACHLICHEN, "Bautraeger.Steuerberater", "System.Lesen"],
  stammdaten: ALLE_FACHLICHEN,
  projekte: [...LEITUNG, "Bautraeger.Vertrieb"],
  verkauf: [...LEITUNG, "Bautraeger.Vertrieb"],
  verkaufZahlungen: [...LEITUNG, "Bautraeger.Vertrieb", "Bautraeger.Buchhaltung"],
  bau: [...LEITUNG, "Bautraeger.Bauleitung"],
  kostenBearbeiten: [...LEITUNG, "Bautraeger.Bauleitung"],
  kostenPruefen: [...LEITUNG, "Bautraeger.Bauleitung", "Bautraeger.Buchhaltung"],
  kostenFreigeben: LEITUNG,
  zahlungen: [...LEITUNG, "Bautraeger.Buchhaltung"],
  sicherheiten: [...LEITUNG, "Bautraeger.Buchhaltung", "Bautraeger.Bauleitung"],
  buchhaltung: [...LEITUNG, "Bautraeger.Buchhaltung", "Bautraeger.Steuerberater"],
  dokumente: ALLE_FACHLICHEN,
  verwaltung: LEITUNG,
};

export const darf = (rollen: readonly string[], recht: Recht) => RECHTE_JE_ROLLE[recht].some((r) => rollen.includes(r));
export const rechteVon = (rollen: readonly string[]) => (Object.keys(RECHTE) as Recht[]).filter((r) => darf(rollen, r));
export const rollenText = (rollen: readonly string[]) => rollen.map((r) => ROLLEN[r as Rolle] ?? r).join(", ");

/** Schreibende API-Aufrufe → benötigtes Recht. Erste passende Regel gilt; ohne Treffer: Verwaltung (sicherer Standard). */
const REGELN: [RegExp, Recht][] = [
  [/^\/eingangsrechnungen\/[^/]+\/freigeben$/, "kostenFreigeben"],
  [/^\/eingangsrechnungen\/[^/]+\/zahlung$/, "zahlungen"],
  [/^\/zahlungslaeufe(\/|$)/, "zahlungen"],
  [/^\/bauabzug(\/|$)/, "zahlungen"],
  [/^\/buchhaltung(\/|$)/, "buchhaltung"],
  [/^\/bankabgleich(\/|$)/, "verkaufZahlungen"],
  [/^\/rechnungseingang(\/|$)/, "kostenPruefen"],
  [/^\/eingangsrechnungen(\/[^/]+\/pruefen)?$/, "kostenPruefen"],
  [/^\/projekte\/[^/]+\/budgetumbuchungen$/, "kostenFreigeben"],
  [/^\/(handwerkervertraege|nachtraege|gewerke)(\/|$)/, "kostenBearbeiten"],
  [/^\/projekte\/[^/]+\/(gewerke|gewerkeplan)$/, "kostenBearbeiten"],
  [/^\/(zahlungseingaenge|mahnungen)(\/|$)/, "verkaufZahlungen"],
  [/^\/(kaufvertraege|sonderwuensche)(\/|$)/, "verkauf"],
  [/^\/schreiben\/(zahlungsanforderung|sonderwunsch)\//, "verkauf"],
  [/^\/schreiben\/mahnung\//, "verkaufZahlungen"],
  [/^\/(projekte\/[^/]+\/)?zahlungsanforderungen(\/|$)/, "verkauf"],
  [/^\/(maengel|abnahmen|vorgaenge|bautenstand)(\/|$)/, "bau"],
  [/^\/projekte\/[^/]+\/(abnahmen|bautenstand|vorgaenge|bauzeitenplan)(\/|$)/, "bau"],
  [/^\/buergschaften(\/|$)/, "sicherheiten"],
  [/^\/dokumente(\/|$)/, "dokumente"],
  [/^\/partner(\/|$)/, "stammdaten"],
  [/^\/import\/partner\//, "stammdaten"],
  [/^\/import\/einheiten\//, "projekte"],
  [/^\/(einheiten)(\/|$)/, "projekte"],
  [/^\/projekte(\/[^/]+(\/(einheiten|kopieren))?)?$/, "projekte"],
];

export function benoetigtesRecht(methode: string, pfad: string): Recht {
  if (["GET", "HEAD", "OPTIONS"].includes(methode.toUpperCase())) return "lesen";
  return REGELN.find(([muster]) => muster.test(pfad))?.[1] ?? "verwaltung";
}

/** Rollen aus dem Header bzw. Token (nur bekannte Rollen werden übernommen). */
export const rollenAus = (wert: unknown): Rolle[] =>
  (Array.isArray(wert) ? wert : typeof wert === "string" ? wert.split(",") : []).map((r) => String(r).trim()).filter((r): r is Rolle => r in ROLLEN);

/** Nur Steuerberater-Rolle (ohne fachliche Rolle) → eigene Startseite und reduzierte Navigation. */
export const nurSteuerberater = (rollen: readonly string[]) => rollen.includes("Bautraeger.Steuerberater") && !rollen.some((r) => ALLE_FACHLICHEN.includes(r as Rolle));
