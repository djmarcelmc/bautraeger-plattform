import {
  type AnyPgColumn,
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
import { sql } from "drizzle-orm";

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
  /** Auftraggeberkonto für SEPA-Überweisungen. */
  iban: text("iban"),
  bic: text("bic"),
  /** Steuernummer des Leistungsempfängers (Bauabzugsteuer-Anmeldung). */
  steuernummer: text("steuernummer"),
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
  bic: text("bic"),
  rollen: partnerRolle("rollen").array().notNull().default([]),
  /** Freistellungsbescheinigung § 48b EStG (Bauabzugsteuer). */
  freistellungGueltigBis: date("freistellung_gueltig_bis"),
  /** Steuernummer und zuständiges Finanzamt des Leistenden (Bauabzugsteuer wird dort angemeldet). */
  steuernummer: text("steuernummer"),
  finanzamt: text("finanzamt"),
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
export const bautenstand = pgTable(
  "bautenstand",
  {
    id: id(),
    einheitId: uuid("einheit_id").notNull().references(() => einheit.id),
    abschnitt: text("abschnitt").notNull(),
    fertigAm: date("fertig_am").notNull(),
    gemeldetVon: text("gemeldet_von"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("bautenstand_einheit_abschnitt").on(t.einheitId, t.abschnitt)],
);

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
  /** Käufer ist Verbraucher (Verzugszins Basiszins + 5 Pp.), sonst Unternehmer (+ 9 Pp.), § 288 BGB. */
  verbraucher: boolean("verbraucher").notNull().default(true),
  /** Fester Verzugszinssatz, falls vertraglich vereinbart (überschreibt Basiszins + Aufschlag). */
  verzugszinsProzent: prozent("verzugszins_prozent"),
  anforderungssperre: boolean("anforderungssperre").notNull().default(false),
  mahnsperre: boolean("mahnsperre").notNull().default(false),
  uebergabeIst: timestamp("uebergabe_ist", { withTimezone: true }),
  gewaehrleistungBis: date("gewaehrleistung_bis"),
  ...zeitstempel,
}, (t) => [uniqueIndex("kaufvertrag_nr_je_projekt").on(t.projektId, t.nr)]);

export const kaufvertragKaeufer = pgTable("kaufvertrag_kaeufer", {
  id: id(),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  partnerId: uuid("partner_id").notNull().references(() => geschaeftspartner.id),
  anteilProzent: prozent("anteil_prozent").notNull().default("100"),
});

/** Eine Einheit kann nur in einem Kaufvertrag stehen. */
export const kaufvertragEinheit = pgTable(
  "kaufvertrag_einheit",
  {
    id: id(),
    kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
    einheitId: uuid("einheit_id").notNull().references(() => einheit.id),
    vkBrutto: geld("vk_brutto").notNull(),
  },
  (t) => [uniqueIndex("einheit_nur_ein_kaufvertrag").on(t.einheitId)],
);

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
  /** Anforderung, mit der die Rate angefordert wurde (mehrere Raten können zusammengefasst werden). */
  zahlungsanforderungId: uuid("zahlungsanforderung_id").references((): AnyPgColumn => zahlungsanforderung.id),
  ...zeitstempel,
});

export const zahlungsanforderung = pgTable("zahlungsanforderung", {
  id: id(),
  kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
  rechnungsnr: text("rechnungsnr").notNull(),
  angefordertAm: date("angefordert_am").notNull(),
  faelligAm: date("faellig_am").notNull(),
  betrag: geld("betrag").notNull(),
  mahnstufe: integer("mahnstufe").notNull().default(0),
  letzteMahnungAm: date("letzte_mahnung_am"),
  ...zeitstempel,
});

/** Mahnung zu einer Zahlungsanforderung (Stufe 1 Zahlungserinnerung, 2 Mahnung, 3 letzte Mahnung). */
export const mahnung = pgTable(
  "mahnung",
  {
    id: id(),
    zahlungsanforderungId: uuid("zahlungsanforderung_id").notNull().references(() => zahlungsanforderung.id),
    stufe: integer("stufe").notNull(),
    datum: date("datum").notNull(),
    fristBis: date("frist_bis").notNull(),
    offenerBetrag: geld("offener_betrag").notNull(),
    verzugszinsen: geld("verzugszinsen").notNull().default("0"),
    mahngebuehr: geld("mahngebuehr").notNull().default("0"),
    erstelltVon: text("erstellt_von"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("mahnung_stufe_je_anforderung").on(t.zahlungsanforderungId, t.stufe)],
);

/** Basiszinssätze nach § 247 BGB (mandantenübergreifend). */
export const basiszins = pgTable("basiszins", {
  gueltigAb: date("gueltig_ab").primaryKey(),
  satz: numeric("satz", { precision: 5, scale: 2, mode: "string" }).notNull(),
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

export const gewerk = pgTable(
  "gewerk",
  {
    id: id(),
    projektId: uuid("projekt_id").notNull().references(() => projekt.id),
    nr: integer("nr").notNull(),
    gruppe: text("gruppe"),
    bezeichnung: text("bezeichnung").notNull(),
    geschaetztBrutto: geld("geschaetzt_brutto").notNull().default("0"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("gewerk_nr_je_projekt").on(t.projektId, t.nr)],
);

/** Vorgang im Bauzeitenplan; optional mit Gewerken (Kostenabfluss) und MaBV-Bauabschnitt (Meilenstein für Raten). */
export const vorgang = pgTable(
  "vorgang",
  {
    id: id(),
    projektId: uuid("projekt_id").notNull().references(() => projekt.id),
    nr: integer("nr").notNull(),
    bezeichnung: text("bezeichnung").notNull(),
    gewerkIds: uuid("gewerk_ids").array().notNull().default(sql`'{}'::uuid[]`),
    mabvAbschnitt: text("mabv_abschnitt"),
    beginn: date("beginn").notNull(),
    ende: date("ende").notNull(),
    endeIst: date("ende_ist"),
    /** Vorgänger (Ende → Anfang) mit Abstand in Tagen. */
    abhaengigkeiten: jsonb("abhaengigkeiten").$type<{ vorgangId: string; abstandTage: number }[]>().notNull().default([]),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("vorgang_abschnitt_je_projekt").on(t.projektId, t.mabvAbschnitt).where(sql`${t.mabvAbschnitt} is not null`)],
);

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
  umlagen: jsonb("umlagen").$type<Record<string, string | null>>().default({}),
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
  bemerkung: text("bemerkung"),
  geprueftAm: timestamp("geprueft_am", { withTimezone: true }),
  geprueftVon: text("geprueft_von"),
  freigegebenAm: timestamp("freigegeben_am", { withTimezone: true }),
  freigegebenVon: text("freigegeben_von"),
  ...zeitstempel,
});

/** SEPA-Sammelüberweisung (pain.001) mit den darin bezahlten Rechnungen. */
export const zahlungslauf = pgTable("zahlungslauf", {
  id: id(),
  gesellschaftId: uuid("gesellschaft_id").notNull().references(() => gesellschaft.id),
  nr: text("nr").notNull(),
  ausfuehrungAm: date("ausfuehrung_am").notNull(),
  anzahl: integer("anzahl").notNull(),
  summe: geld("summe").notNull(),
  xml: text("xml").notNull(),
  erstelltVon: text("erstellt_von"),
  ...zeitstempel,
});

export const zahlungsausgang = pgTable("zahlungsausgang", {
  id: id(),
  eingangsrechnungId: uuid("eingangsrechnung_id").notNull().references(() => eingangsrechnung.id),
  zahlungslaufId: uuid("zahlungslauf_id").references(() => zahlungslauf.id),
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
  nr: text("nr"),
  betrag: geld("betrag").notNull(),
  ausgestelltAm: date("ausgestellt_am"),
  gueltigBis: date("gueltig_bis"),
  rueckgabeAm: date("rueckgabe_am"),
  bemerkung: text("bemerkung"),
  ...zeitstempel,
});

// ---------------------------------------------------------------- Mängel

export const mangel = pgTable("mangel", {
  id: id(),
  projektId: uuid("projekt_id").notNull().references(() => projekt.id),
  nr: integer("nr").notNull(),
  einheitId: uuid("einheit_id").references(() => einheit.id),
  gewerkId: uuid("gewerk_id").references(() => gewerk.id),
  handwerkervertragId: uuid("handwerkervertrag_id").references(() => handwerkervertrag.id),
  handwerkerId: uuid("handwerker_id").references(() => geschaeftspartner.id),
  kaufvertragId: uuid("kaufvertrag_id").references(() => kaufvertrag.id),
  abnahmeId: uuid("abnahme_id").references((): AnyPgColumn => abnahme.id),
  eigentum: text("eigentum", { enum: ["sonder", "gemeinschaft"] }).notNull().default("sonder"),
  festgestelltAm: date("festgestellt_am").notNull(),
  festgestelltDurch: text("festgestellt_durch"),
  titel: text("titel").notNull(),
  /** Lage, z. B. „Bad OG, Dusche“. */
  ort: text("ort"),
  beschreibung: text("beschreibung"),
  mangelart: text("mangelart"),
  wertHandwerkerBrutto: geld("wert_handwerker_brutto").default("0"),
  wertKundeBrutto: geld("wert_kunde_brutto").default("0"),
  einbehalt: boolean("einbehalt").notNull().default(false),
  angebotsanforderungAm: date("angebotsanforderung_am"),
  auftragserteilungAm: date("auftragserteilung_am"),
  ersatzvornahmeAm: date("ersatzvornahme_am"),
  erledigtAm: date("erledigt_am"),
  erledigtVon: text("erledigt_von"),
  ...zeitstempel,
}, (t) => [uniqueIndex("mangel_nr_je_projekt").on(t.projektId, t.nr)]);

/** Persönlicher Link für Käufer (Mängelanzeige ohne Konto); gespeichert wird nur der SHA-256 des Tokens. */
export const portalzugang = pgTable(
  "portalzugang",
  {
    id: id(),
    kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
    tokenHash: text("token_hash").notNull(),
    gueltigBis: date("gueltig_bis").notNull(),
    widerrufenAm: timestamp("widerrufen_am", { withTimezone: true }),
    letzterZugriffAm: timestamp("letzter_zugriff_am", { withTimezone: true }),
    erstelltVon: text("erstellt_von"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("portalzugang_token").on(t.tokenHash)],
);

/** Abnahmeprotokoll (Sondereigentum, Gemeinschaftseigentum oder Handwerkerleistung). */
export const abnahme = pgTable(
  "abnahme",
  {
    id: id(),
    projektId: uuid("projekt_id").notNull().references(() => projekt.id),
    nr: integer("nr").notNull(),
    art: text("art").notNull(),
    kaufvertragId: uuid("kaufvertrag_id").references(() => kaufvertrag.id),
    einheitId: uuid("einheit_id").references(() => einheit.id),
    handwerkervertragId: uuid("handwerkervertrag_id").references(() => handwerkervertrag.id),
    datum: date("datum").notNull(),
    ort: text("ort"),
    teilnehmer: text("teilnehmer"),
    bemerkung: text("bemerkung"),
    schluessel: text("schluessel"),
    zaehler: jsonb("zaehler").$type<Record<string, string | null>>().notNull().default({}),
    ergebnis: text("ergebnis"),
    vorbehaltVertragsstrafe: boolean("vorbehalt_vertragsstrafe").notNull().default(false),
    gewaehrleistungMonate: integer("gewaehrleistung_monate"),
    abgeschlossenAm: timestamp("abgeschlossen_am", { withTimezone: true }),
    abgeschlossenVon: text("abgeschlossen_von"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("abnahme_nr_je_projekt").on(t.projektId, t.nr)],
);

/** Standardmängel-Katalog je Mandant. */
export const mangelvorlage = pgTable("mangelvorlage", {
  id: id(),
  mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
  kategorie: text("kategorie").notNull(),
  gewerkNr: integer("gewerk_nr"),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  ...zeitstempel,
});

export const ruege = pgTable("ruege", {
  id: id(),
  mangelId: uuid("mangel_id").notNull().references(() => mangel.id),
  stufe: integer("stufe").notNull(),
  geruegtAm: date("geruegt_am").notNull(),
  fristBis: date("frist_bis").notNull(),
  nachfristBis: date("nachfrist_bis"),
  bemerkung: text("bemerkung"),
  ...zeitstempel,
}, (t) => [uniqueIndex("ruege_stufe_je_mangel").on(t.mangelId, t.stufe)]);

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
  groesse: integer("groesse"),
  beschreibung: text("beschreibung"),
  hochgeladenVon: text("hochgeladen_von"),
  /** GoBD: Dokumente werden nicht physisch gelöscht, sondern ausgeblendet. */
  geloeschtAm: timestamp("geloescht_am", { withTimezone: true }),
  geloeschtVon: text("geloescht_von"),
  ...zeitstempel,
});

/** Fortlaufende Nummern je Gesellschaft, Art (z. B. "ZA") und Jahr. */
export const nummernkreis = pgTable(
  "nummernkreis",
  {
    id: id(),
    gesellschaftId: uuid("gesellschaft_id").notNull().references(() => gesellschaft.id),
    art: text("art").notNull(),
    jahr: integer("jahr").notNull(),
    letzte: integer("letzte").notNull().default(0),
  },
  (t) => [uniqueIndex("nummernkreis_eindeutig").on(t.gesellschaftId, t.art, t.jahr)],
);

/** GoBD-Änderungsprotokoll. */
/** Postausgang für E-Mails (Versand durch einen Hintergrundlauf mit Wiederholungen). */
export const nachricht = pgTable("nachricht", {
  id: id(),
  mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
  an: text("an").array().notNull(),
  betreff: text("betreff").notNull(),
  text: text("text").notNull(),
  html: text("html"),
  /** Anlass, z. B. "mangel_gemeldet", "mangel_status", "aufgaben", "test". */
  anlass: text("anlass").notNull(),
  bezugId: uuid("bezug_id"),
  /** Anhänge aus der Dokumentablage */
  anhaenge: jsonb("anhaenge").$type<{ dokumentId: string; dateiname: string }[]>().notNull().default([]),
  status: text("status", { enum: ["wartend", "gesendet", "fehler", "protokolliert"] }).notNull().default("wartend"),
  versuche: integer("versuche").notNull().default(0),
  naechsterVersuchAm: timestamp("naechster_versuch_am", { withTimezone: true }).notNull().defaultNow(),
  fehler: text("fehler"),
  gesendetAm: timestamp("gesendet_am", { withTimezone: true }),
  ...zeitstempel,
});

/** Einstellungen je Mandant (Schlüssel/Wert). */
export const einstellung = pgTable(
  "einstellung",
  {
    id: id(),
    mandantId: uuid("mandant_id").notNull().references(() => mandant.id),
    schluessel: text("schluessel").notNull(),
    wert: jsonb("wert").notNull(),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("einstellung_je_mandant").on(t.mandantId, t.schluessel)],
);

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

/** Bauabzugsteuer-Anmeldung (§ 48a EStG) je Leistungsempfänger, Leistendem und Monat. */
export const bauabzugAnmeldung = pgTable(
  "bauabzug_anmeldung",
  {
    id: id(),
    gesellschaftId: uuid("gesellschaft_id").notNull().references(() => gesellschaft.id),
    handwerkerId: uuid("handwerker_id").notNull().references(() => geschaeftspartner.id),
    /** Anmeldungszeitraum JJJJ-MM */
    monat: text("monat").notNull(),
    /** Stand bei der Anmeldung */
    gegenleistung: geld("gegenleistung").notNull(),
    abzugsbetrag: geld("abzugsbetrag").notNull(),
    angemeldetAm: date("angemeldet_am").notNull(),
    abgefuehrtAm: date("abgefuehrt_am"),
    bemerkung: text("bemerkung"),
    angemeldetVon: text("angemeldet_von"),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("bauabzug_anmeldung_eindeutig").on(t.gesellschaftId, t.handwerkerId, t.monat)],
);

export const sonderwunschStatus = pgEnum("sonderwunsch_status", ["angebot", "beauftragt", "abgelehnt"]);

/** Sonderwünsche/Zusatzleistungen und Gutschriften (Minderleistungen) eines Kaufvertrags. */
export const sonderwunsch = pgTable(
  "sonderwunsch",
  {
    id: id(),
    kaufvertragId: uuid("kaufvertrag_id").notNull().references(() => kaufvertrag.id),
    nr: integer("nr").notNull(),
    art: rateTyp("art").notNull().default("zusatzleistung"),
    bezeichnung: text("bezeichnung").notNull(),
    beschreibung: text("beschreibung"),
    /** Preis für den Käufer (brutto, immer positiv; Gutschriften werden abgezogen) */
    betragBrutto: geld("betrag_brutto").notNull(),
    /** Voraussichtliche Mehr-/Minderkosten beim Handwerker (brutto) – für die Marge */
    kostenBrutto: geld("kosten_brutto"),
    gewerkId: uuid("gewerk_id").references(() => gewerk.id),
    /** Abrechnung mit diesem MaBV-Abschnitt (leer = sofort nach Beauftragung anforderbar) */
    abschnitt: text("abschnitt"),
    status: sonderwunschStatus("status").notNull().default("angebot"),
    angebotAm: date("angebot_am"),
    gueltigBis: date("gueltig_bis"),
    entschiedenAm: date("entschieden_am"),
    rateId: uuid("rate_id").references(() => rate.id),
    ...zeitstempel,
  },
  (t) => [uniqueIndex("sonderwunsch_nr_je_vertrag").on(t.kaufvertragId, t.nr)],
);
