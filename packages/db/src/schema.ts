import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Geldbeträge: numeric(14,2), im Code als String → Decimal. */
const geld = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "string" });
const prozent = (name: string) => numeric(name, { precision: 7, scale: 4, mode: "string" });
const id = () => uuid("id").primaryKey().defaultRandom();
const zeitstempel = {
  angelegtAm: timestamp("angelegt_am", { withTimezone: true }).notNull().defaultNow(),
  geaendertAm: timestamp("geaendert_am", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------- Mandant & Gesellschaft

export const mandant = pgTable("mandant", {
  id: id(),
  name: text("name").notNull(),
  ...zeitstempel,
});

export const gesellschaft = pgTable("gesellschaft", {
  id: id(),
  mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
  nr: integer("nr").notNull(),
  name: text("name").notNull(),
  anschrift: text("anschrift"),
  datevBeraternr: integer("datev_beraternr"),
  datevMandantennr: integer("datev_mandantennr"),
  skr: text("skr").default("03"),
  sachkontenlaenge: integer("sachkontenlaenge").default(4),
  ...zeitstempel,
}, (t) => [uniqueIndex("gesellschaft_nr_je_mandant").on(t.mandantId, t.nr)]);

// ---------------------------------------------------------------- Geschäftspartner

export const partnerRolle = pgEnum("partner_rolle", [
  "kunde",
  "interessent",
  "handwerker",
  "lieferant",
  "notar",
  "makler",
  "bank",
  "sonstige",
]);

export const geschaeftspartner = pgTable("geschaeftspartner", {
  id: id(),
  mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
  nr: integer("nr").notNull(),
  suchcode: text("suchcode").notNull(),
  firma: text("firma"),
  anrede: text("anrede"),
  vorname: text("vorname"),
  nachname: text("nachname"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  email: text("email"),
  telefon: text("telefon"),
  iban: text("iban"),
  rollen: partnerRolle("rollen").array().notNull().default([]),
  /** Freistellungsbescheinigung § 48b EStG (Bauabzugsteuer). */
  freistellungGueltigBis: date("freistellung_gueltig_bis"),
  ...zeitstempel,
}, (t) => [uniqueIndex("partner_nr_je_mandant").on(t.mandantId, t.nr)]);

// ---------------------------------------------------------------- Projekte & Einheiten

export const projektart = pgEnum("projektart", ["bautraeger", "werkvertrag", "gemischt"]);

export const projekt = pgTable(
  "projekt",
  {
    id: id(),
    gesellschaftId: uuid("gesellschaft_id").notNull().references(() => gesellschaft.id),
    nr: integer("nr").notNull(),
    suchcode: text("suchcode").notNull(),
    strasse: text("strasse"),
    plz: text("plz"),
    ort: text("ort"),
    art: projektart("art").notNull().default("bautraeger"),
    para13bAnwendbar: boolean("para13b_anwendbar").notNull().default(false),
    grundbuchamt: text("grundbuchamt"),
    grundbuchBlatt: text("grundbuch_blatt"),
    flurstueck: text("flurstueck"),
    kostenstelle: text("kostenstelle"),
    projektbeginn: date("projektbeginn"),
    baubeginnSoll: date("baubeginn_soll"),
    baubeginnIst: date("baubeginn_ist"),
    fertigstellungSoll: date("fertigstellung_soll"),
    fertigstellungIst: date("fertigstellung_ist"),
    abgeschlossen: boolean("abgeschlossen").notNull().default(false),
    /** Wahlfelder (Entwurfsplanung, Bauvoranfrage, Baugenehmigung …) */
    wahlfelder: jsonb("wahlfelder").$type<Record<string, string>>().default({}),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("projekt_nr_je_gesellschaft").on(t.gesellschaftId, t.nr)],
);

export const einheitTyp = pgEnum("einheit_typ", ["wohnung", "stellplatz", "gewerbe", "hobbyraum", "sonstiges"]);

export const einheit = pgTable("einheit", {
  id: id(),
  projektId: uuid("projekt_id").notNull().references(() => projekt.id),
  nr: text("nr").notNull(),
  typ: einheitTyp("typ").notNull(),
  bauabschnitt: integer("bauabschnitt").default(1),
  etage: text("etage"),
  art: text("art"),
  wohnflaeche: numeric("wohnflaeche", { precision: 10, scale: 2, mode: "string" }),
  miteigentumTsd: numeric("miteigentum_tsd", { precision: 10, scale: 3, mode: "string" }),
  preisProM2: geld("preis_pro_m2"),
  vkBrutto: geld("vk_brutto"),
  mindestVk: geld("mindest_vk"),
  reserviertFuer: uuid("reserviert_fuer").references(() => geschaeftspartner.id),
  reserviertBis: date("reserviert_bis"),
  /** Verknüpfter Stellplatz o. Ä. */
  zugehoerigZuEinheitId: uuid("zugehoerig_zu_einheit_id"),
  ...zeitstempel,
}, (t) => [uniqueIndex("einheit_nr_je_projekt").on(t.projektId, t.nr)]);

/** Fertigmeldung eines MaBV-Bauabschnitts je Einheit. */
export const bautenstand = pgTable("bautenstand", {
  id: id(),
  einheitId: uuid("einheit_id").notNull().references(() => einheit.id),
  abschnitt: text("abschnitt").notNull(),
  fertigAm: date("fertig_am").notNull(),
  gemeldetVon: text("gemeldet_von"),
  ...zeitstempel,
});

// ---------------------------------------------------------------- Verkauf

export const kaufvertrag = pgTable("kaufvertrag", {
  id: id(),
  projektId: uuid("projekt_id").notNull().references(() => projekt.id),
  nr: text("nr").notNull(),
  urkundennr: text("urkundennr"),
  datum: date("datum"),
  zahlungsanforderungAn: uuid("zahlungsanforderung_an").references(() => geschaeftspartner.id),
  erbbaurecht: boolean("erbbaurecht").notNull().default(false),
  vertragWirksam: boolean("vertrag_wirksam").notNull().default(false),
  vormerkungEingetragenAm: date("vormerkung_eingetragen_am"),
  lastenfreistellungGesichert: boolean("lastenfreistellung_gesichert").notNull().default(false),
  buergschaftNach7: boolean("buergschaft_nach_7").notNull().default(false),
  zahlungszielTage: integer("zahlungsziel_tage").notNull().default(10),
  verzugszinsProzent: prozent("verzugszins_prozent"),
  anforderungssperre: boolean("anforderungssperre").notNull().default(false),
  mahnsperre: boolean("mahnsperre").notNull().default(false),
  uebergabeIst: timestamp("uebergabe_ist", { withTimezone: true }),
  gewaehrleistungBis: date("gewaehrleistung_bis"),
  ...zeitstempel,
});

export const kaufvertragKaeufer = pgTable("kaufvertrag_kaeufer", {
  id: id(),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  partnerId: uuid("partner_id").notNull().references(() => geschaeftspartner.id),
  anteilProzent: prozent("anteil_prozent").notNull().default("100"),
});

export const kaufvertragEinheit = pgTable("kaufvertrag_einheit", {
  id: id(),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  einheitId: uuid("einheit_id").notNull().references(() => einheit.id),
  vkBrutto: geld("vk_brutto").notNull(),
});

export const rateTyp = pgEnum("rate_typ", ["mabv", "zusatzleistung", "gutschrift"]);

export const rate = pgTable("rate", {
  id: id(),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  nr: integer("nr").notNull(),
  typ: rateTyp("typ").notNull().default("mabv"),
  abschnitte: text("abschnitte").array().notNull().default([]),
  prozent: prozent("prozent"),
  betrag: geld("betrag").notNull(),
  text: text("text"),
  ...zeitstempel,
});

export const zahlungsanforderung = pgTable("zahlungsanforderung", {
  id: id(),
  rateId: uuid("rate_id").notNull().references(() => rate.id),
  rechnungsnr: text("rechnungsnr").notNull(),
  angefordertAm: date("angefordert_am").notNull(),
  faelligAm: date("faellig_am").notNull(),
  betrag: geld("betrag").notNull(),
  mahnstufe: integer("mahnstufe").notNull().default(0),
  letzteMahnungAm: date("letzte_mahnung_am"),
  ...zeitstempel,
});

export const zahlungseingang = pgTable("zahlungseingang", {
  id: id(),
  zahlungsanforderungId: uuid("zahlungsanforderung_id").references(() => zahlungsanforderung.id),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  datum: date("datum").notNull(),
  betrag: geld("betrag").notNull(),
  verwendungszweck: text("verwendungszweck"),
  ...zeitstempel,
});

// ---------------------------------------------------------------- Kosten

export const gewerk = pgTable("gewerk", {
  id: id(),
  projektId: uuid("projekt_id").notNull().references(() => projekt.id),
  nr: integer("nr").notNull(),
  gruppe: text("gruppe"),
  bezeichnung: text("bezeichnung").notNull(),
  geschaetztBrutto: geld("geschaetzt_brutto").notNull().default("0"),
  ...zeitstempel,
});

export const handwerkervertrag = pgTable("handwerkervertrag", {
  id: id(),
  gewerkId: uuid("gewerk_id").notNull().references(() => gewerk.id),
  handwerkerId: uuid("handwerker_id").references(() => geschaeftspartner.id),
  nrIntern: text("nr_intern"),
  angebotVom: date("angebot_vom"),
  vertragVom: date("vertrag_vom"),
  vertragBrutto: geld("vertrag_brutto").notNull().default("0"),
  nachlassProzent: prozent("nachlass_prozent").default("0"),
  skontoProzent: prozent("skonto_prozent").default("0"),
  skontoFristTage: integer("skonto_frist_tage"),
  zahlungsfristTage: integer("zahlungsfrist_tage"),
  /** Umlagen je Art in %: { wasser: 0.3, strom: 0.3, bauschutt: 0.5, … } */
  umlagen: jsonb("umlagen").$type<Record<string, number>>().default({}),
  einbehaltVertragserfuellungProzent: prozent("einbehalt_ve_prozent").default("0"),
  einbehaltGewaehrleistungProzent: prozent("einbehalt_gw_prozent").default("0"),
  gewaehrleistungMonate: integer("gewaehrleistung_monate"),
  abnahmeAm: date("abnahme_am"),
  ...zeitstempel,
});

export const nachtragStatus = pgEnum("nachtrag_status", ["angeboten", "beauftragt", "abgelehnt", "abgerechnet"]);

export const nachtrag = pgTable("nachtrag", {
  id: id(),
  handwerkervertragId: uuid("handwerkervertrag_id").notNull().references(() => handwerkervertrag.id),
  nr: integer("nr").notNull(),
  text: text("text").notNull(),
  betragBrutto: geld("betrag_brutto").notNull(),
  status: nachtragStatus("status").notNull().default("angeboten"),
  ...zeitstempel,
});

export const rechnungStatus = pgEnum("rechnung_status", [
  "erfasst",
  "sachlich_geprueft",
  "rechnerisch_geprueft",
  "freigegeben",
  "bezahlt",
]);

export const eingangsrechnung = pgTable("eingangsrechnung", {
  id: id(),
  handwerkervertragId: uuid("handwerkervertrag_id").notNull().references(() => handwerkervertrag.id),
  rechnungsnr: text("rechnungsnr").notNull(),
  rechnungsdatum: date("rechnungsdatum").notNull(),
  eingangAm: date("eingang_am").notNull(),
  schlussrechnung: boolean("schlussrechnung").notNull().default(false),
  betragBrutto: geld("betrag_brutto").notNull(),
  geprueftKumuliert: geld("geprueft_kumuliert"),
  /** Ergebnis der Prüfkette (Nachlass, Umlagen, Einbehalt, Skonto, Bauabzugsteuer, Auszahlung). */
  pruefergebnis: jsonb("pruefergebnis").$type<Record<string, string>>(),
  status: rechnungStatus("status").notNull().default("erfasst"),
  ...zeitstempel,
});

export const zahlungsausgang = pgTable("zahlungsausgang", {
  id: id(),
  eingangsrechnungId: uuid("eingangsrechnung_id").notNull().references(() => eingangsrechnung.id),
  datum: date("datum").notNull(),
  betrag: geld("betrag").notNull(),
  skonto: geld("skonto").notNull().default("0"),
  bauabzugsteuer: geld("bauabzugsteuer").notNull().default("0"),
  ...zeitstempel,
});

export const buergschaft = pgTable("buergschaft", {
  id: id(),
  richtung: text("richtung", { enum: ["erhalten", "ausgegeben"] }).notNull(),
  art: text("art").notNull(),
  handwerkervertragId: uuid("handwerkervertrag_id").references(() => handwerkervertrag.id),
  kaufvertragId: uuid("kaufvertrag_id").references(() => kaufvertrag.id),
  buergeId: uuid("buerge_id").references(() => geschaeftspartner.id),
  betrag: geld("betrag").notNull(),
  gueltigBis: date("gueltig_bis"),
  rueckgabeAm: date("rueckgabe_am"),
  ...zeitstempel,
});

// ---------------------------------------------------------------- Mängel

export const mangel = pgTable("mangel", {
  id: id(),
  projektId: uuid("projekt_id").notNull().references(() => projekt.id),
  nr: integer("nr").notNull(),
  einheitId: uuid("einheit_id").references(() => einheit.id),
  gewerkId: uuid("gewerk_id").references(() => gewerk.id),
  handwerkerId: uuid("handwerker_id").references(() => geschaeftspartner.id),
  kaufvertragId: uuid("kaufvertrag_id").references(() => kaufvertrag.id),
  eigentum: text("eigentum", { enum: ["sonder", "gemeinschaft"] }).notNull().default("sonder"),
  festgestelltAm: date("festgestellt_am").notNull(),
  festgestelltDurch: text("festgestellt_durch"),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  mangelart: text("mangelart"),
  wertHandwerkerBrutto: geld("wert_handwerker_brutto").default("0"),
  wertKundeBrutto: geld("wert_kunde_brutto").default("0"),
  einbehalt: boolean("einbehalt").notNull().default(false),
  ersatzvornahmeAm: date("ersatzvornahme_am"),
  erledigtAm: date("erledigt_am"),
  ...zeitstempel,
});

export const ruege = pgTable("ruege", {
  id: id(),
  mangelId: uuid("mangel_id").notNull().references(() => mangel.id),
  stufe: integer("stufe").notNull(),
  geruegtAm: date("geruegt_am").notNull(),
  fristBis: date("frist_bis").notNull(),
  nachfristBis: date("nachfrist_bis"),
  ...zeitstempel,
});

// ---------------------------------------------------------------- Buchhaltung & Dokumente

/** DATEV-neutrales Buchungsjournal – Quelle für den DATEV-Adapter. */
export const buchung = pgTable("buchung", {
  id: id(),
  gesellschaftId: uuid("gesellschaft_id").notNull().references(() => gesellschaft.id),
  belegdatum: date("belegdatum").notNull(),
  belegnr: text("belegnr"),
  konto: text("konto").notNull(),
  gegenkonto: text("gegenkonto").notNull(),
  betrag: geld("betrag").notNull(),
  sollHaben: text("soll_haben", { enum: ["S", "H"] }).notNull(),
  steuerschluessel: text("steuerschluessel"),
  buchungstext: text("buchungstext"),
  kostenstelle: text("kostenstelle"),
  quelleTyp: text("quelle_typ").notNull(),
  quelleId: uuid("quelle_id").notNull(),
  dokumentId: uuid("dokument_id"),
  exportiertAm: timestamp("exportiert_am", { withTimezone: true }),
  exportStapel: text("export_stapel"),
  ...zeitstempel,
});

export const dokument = pgTable("dokument", {
  id: id(),
  mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
  /** Objekt, an dem das Dokument hängt, z. B. "projekt", "kaufvertrag", "mangel". */
  objektTyp: text("objekt_typ").notNull(),
  objektId: uuid("objekt_id").notNull(),
  ordner: text("ordner"),
  dateiname: text("dateiname").notNull(),
  mimeType: text("mime_type"),
  speicherKey: text("speicher_key").notNull(),
  sha256: text("sha256").notNull(),
  beschreibung: text("beschreibung"),
  ...zeitstempel,
});

/** GoBD-Änderungsprotokoll. */
export const aenderungsprotokoll = pgTable("aenderungsprotokoll", {
  id: id(),
  tabelle: text("tabelle").notNull(),
  datensatzId: uuid("datensatz_id").notNull(),
  aktion: text("aktion", { enum: ["insert", "update", "delete"] }).notNull(),
  alt: jsonb("alt"),
  neu: jsonb("neu"),
  benutzer: text("benutzer").notNull(),
  quelle: text("quelle").notNull().default("ui"),
  zeitpunkt: timestamp("zeitpunkt", { withTimezone: true }).notNull().defaultNow(),
});
