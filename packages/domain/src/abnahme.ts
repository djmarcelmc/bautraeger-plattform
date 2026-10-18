import { z } from "zod";
import { datum, ganzzahlOptional, pflichttext, text, uuidOptional } from "./felder.js";

// ---------------------------------------------------------------- Abnahme

export const ABNAHME_ARTEN = ["sondereigentum", "gemeinschaftseigentum", "handwerker"] as const;
export type AbnahmeArt = (typeof ABNAHME_ARTEN)[number];
export const ABNAHME_ART_TEXT: Record<AbnahmeArt, string> = {
  sondereigentum: "Abnahme Sondereigentum (Käufer)",
  gemeinschaftseigentum: "Abnahme Gemeinschaftseigentum",
  handwerker: "Abnahme Handwerkerleistung",
};

export const ABNAHME_ERGEBNISSE = ["abgenommen", "vorbehalt", "verweigert"] as const;
export type AbnahmeErgebnis = (typeof ABNAHME_ERGEBNISSE)[number];
export const ABNAHME_ERGEBNIS_TEXT: Record<AbnahmeErgebnis, string> = {
  abgenommen: "abgenommen",
  vorbehalt: "abgenommen unter Vorbehalt der aufgeführten Mängel",
  verweigert: "Abnahme verweigert (wesentliche Mängel)",
};

export const ZAEHLER = ["strom", "wasserKalt", "wasserWarm", "waerme", "gas"] as const;
export const ZAEHLER_TEXT: Record<(typeof ZAEHLER)[number], string> = {
  strom: "Strom (kWh)",
  wasserKalt: "Kaltwasser (m³)",
  wasserWarm: "Warmwasser (m³)",
  waerme: "Wärmemenge (kWh)",
  gas: "Gas (m³)",
};

export const AbnahmeEingabe = z
  .object({
    art: z.enum(ABNAHME_ARTEN, "Art der Abnahme wählen"),
    datum: datum().refine((d) => !!d, "Datum der Abnahme angeben").transform((d) => d!),
    kaufvertragId: uuidOptional(),
    einheitId: uuidOptional(),
    handwerkervertragId: uuidOptional(),
    ort: text(200),
    teilnehmer: text(1000),
    bemerkung: text(2000),
    schluessel: text(500),
    zaehler: z.partialRecord(z.enum(ZAEHLER), text(40)).default({}),
  })
  .refine((a) => a.art !== "sondereigentum" || !!a.kaufvertragId, { path: ["kaufvertragId"], message: "Für die Abnahme des Sondereigentums den Kaufvertrag wählen" })
  .refine((a) => a.art !== "handwerker" || !!a.handwerkervertragId, { path: ["handwerkervertragId"], message: "Für die Handwerkerabnahme den Vertrag wählen" });
export type AbnahmeEingabe = z.infer<typeof AbnahmeEingabe>;

export const AbnahmeAbschluss = z.object({
  ergebnis: z.enum(ABNAHME_ERGEBNISSE, "Ergebnis wählen"),
  vorbehaltVertragsstrafe: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
  gewaehrleistungMonate: z.preprocess((v) => (v === "" || v === undefined ? 60 : v), z.coerce.number().int().min(0, "Mindestens 0").max(120, "Höchstens 120")),
});

export const AbnahmeMaengelEingabe = z
  .object({
    vorlageIds: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid())),
    titel: text(200),
    beschreibung: text(4000),
    ort: text(200),
    gewerkId: uuidOptional(),
  })
  .refine((m) => m.vorlageIds.length > 0 || !!m.titel, { path: ["titel"], message: "Mangel beschreiben oder Standardmängel auswählen" });

/** Gesetzliche Verjährung für Mängelansprüche bei Bauwerken: 5 Jahre ab Abnahme (§ 634a Abs. 1 Nr. 2 BGB). */
export const GEWAEHRLEISTUNG_BAUWERK_MONATE = 60;

// ---------------------------------------------------------------- Standardmängel

export const MangelvorlageEingabe = z.object({
  kategorie: pflichttext(60),
  gewerkNr: ganzzahlOptional(1, 9999),
  titel: pflichttext(200),
  beschreibung: text(2000),
});
export type MangelvorlageEingabe = z.infer<typeof MangelvorlageEingabe>;

const v = (kategorie: string, gewerkNr: number | null, liste: [string, string][]) => liste.map(([titel, beschreibung]) => ({ kategorie, gewerkNr, titel, beschreibung }));

/** Startkatalog häufiger Abnahmemängel im Wohnungsbau; je Mandant anpassbar. */
export const STANDARD_MAENGEL: readonly { kategorie: string; gewerkNr: number | null; titel: string; beschreibung: string }[] = [
  ...v("Maler", 337, [
    ["Wandfläche ungleichmäßig gestrichen", "Ansätze/Streifen im Streiflicht sichtbar, Fläche nachstreichen."],
    ["Farbspritzer auf Bodenbelag/Fensterrahmen", "Farbreste entfernen, Oberflächen reinigen."],
    ["Risse in Wand-/Deckenanschlussfuge", "Acrylfuge erneuern und überstreichen."],
  ]),
  ...v("Fliesen", 355, [
    ["Fliese gesprungen", "Beschädigte Fliese austauschen, Ersatzfliese aus gleicher Charge."],
    ["Fugen unvollständig/ausgebrochen", "Fugen nacharbeiten, Farbton angleichen."],
    ["Silikonfuge fehlt oder schadhaft", "Wartungsfuge (Sanitärsilikon) erneuern."],
    ["Fliesenbelag hohl liegend", "Hohlstellen prüfen, Fliesen neu verlegen."],
  ]),
  ...v("Estrich/Bodenbeläge", 354, [
    ["Parkett/Laminat mit Kratzern", "Beschädigte Dielen austauschen bzw. Oberfläche aufarbeiten."],
    ["Sockelleiste lose oder fehlend", "Sockelleisten befestigen bzw. ergänzen."],
    ["Bodenbelag Fugen offen", "Fugenbild prüfen, offene Stöße schließen."],
  ]),
  ...v("Fenster/Türen", 334, [
    ["Fenster schließt schwergängig", "Beschläge einstellen, Funktion prüfen."],
    ["Rollladen läuft nicht/klemmt", "Antrieb und Führungsschienen prüfen und einstellen."],
    ["Glasscheibe verkratzt", "Scheibe tauschen, sofern Kratzer aus 1 m Abstand sichtbar."],
    ["Fensterbank innen beschädigt", "Fensterbank ausbessern bzw. austauschen."],
  ]),
  ...v("Innentüren", 344, [
    ["Innentür schleift/fällt nicht ins Schloss", "Bänder und Schließblech einstellen."],
    ["Türblatt/Zarge beschädigt", "Beschädigung ausbessern oder Bauteil austauschen."],
    ["Türdrücker lose", "Drückergarnitur befestigen."],
  ]),
  ...v("Sanitär", 421, [
    ["Armatur tropft", "Kartusche/Dichtung tauschen, Dichtheit prüfen."],
    ["Abfluss läuft schlecht ab", "Siphon und Leitung reinigen, Gefälle prüfen."],
    ["Sanitärobjekt beschädigt (Abplatzung)", "Objekt austauschen."],
    ["WC-Spülung läuft nach", "Spülkasten einstellen bzw. Ventil tauschen."],
  ]),
  ...v("Heizung", 420, [
    ["Heizkörper wird nicht warm", "Entlüften, hydraulischen Abgleich prüfen."],
    ["Fußbodenheizung Raum ohne Funktion", "Stellantrieb und Raumthermostat prüfen."],
  ]),
  ...v("Elektro", 400, [
    ["Steckdose/Schalter ohne Funktion", "Anschluss prüfen und instand setzen."],
    ["Abdeckrahmen fehlt oder schief", "Rahmen ergänzen bzw. ausrichten."],
    ["Klingel/Sprechanlage ohne Funktion", "Anlage prüfen und in Betrieb nehmen."],
  ]),
  ...v("Fassade/Außen", 335, [
    ["Putzriss in der Fassade", "Riss aufnehmen, Ursache klären, fachgerecht schließen."],
    ["Balkonentwässerung verstopft", "Ablauf reinigen, Gefälle prüfen."],
  ]),
  ...v("Allgemein", null, [
    ["Endreinigung unzureichend", "Bauendreinigung nachholen (Fenster, Böden, Sanitär)."],
    ["Restarbeiten nicht fertiggestellt", "Fehlende Leistungen gemäß Baubeschreibung fertigstellen."],
    ["Feuchtigkeitsfleck", "Ursache feststellen (Leitung/Abdichtung/Kondensat) und beseitigen."],
  ]),
];
