CREATE TYPE "public"."einheit_typ" AS ENUM('wohnung', 'stellplatz', 'gewerbe', 'hobbyraum', 'sonstiges');--> statement-breakpoint
CREATE TYPE "public"."nachtrag_status" AS ENUM('angeboten', 'beauftragt', 'abgelehnt', 'abgerechnet');--> statement-breakpoint
CREATE TYPE "public"."partner_rolle" AS ENUM('kunde', 'interessent', 'handwerker', 'lieferant', 'notar', 'makler', 'bank', 'sonstige');--> statement-breakpoint
CREATE TYPE "public"."projektart" AS ENUM('bautraeger', 'werkvertrag', 'gemischt');--> statement-breakpoint
CREATE TYPE "public"."rate_typ" AS ENUM('mabv', 'zusatzleistung', 'gutschrift');--> statement-breakpoint
CREATE TYPE "public"."rechnung_status" AS ENUM('erfasst', 'sachlich_geprueft', 'rechnerisch_geprueft', 'freigegeben', 'bezahlt');--> statement-breakpoint
CREATE TABLE "aenderungsprotokoll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabelle" text NOT NULL,
	"datensatz_id" uuid NOT NULL,
	"aktion" text NOT NULL,
	"alt" jsonb,
	"neu" jsonb,
	"benutzer" text NOT NULL,
	"quelle" text DEFAULT 'ui' NOT NULL,
	"zeitpunkt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bautenstand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"einheit_id" uuid NOT NULL,
	"abschnitt" text NOT NULL,
	"fertig_am" date NOT NULL,
	"gemeldet_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buchung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"belegdatum" date NOT NULL,
	"belegnr" text,
	"konto" text NOT NULL,
	"gegenkonto" text NOT NULL,
	"betrag" numeric(14, 2) NOT NULL,
	"soll_haben" text NOT NULL,
	"steuerschluessel" text,
	"buchungstext" text,
	"kostenstelle" text,
	"quelle_typ" text NOT NULL,
	"quelle_id" uuid NOT NULL,
	"dokument_id" uuid,
	"exportiert_am" timestamp with time zone,
	"export_stapel" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buergschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"richtung" text NOT NULL,
	"art" text NOT NULL,
	"handwerkervertrag_id" uuid,
	"kaufvertrag_id" uuid,
	"buerge_id" uuid,
	"betrag" numeric(14, 2) NOT NULL,
	"gueltig_bis" date,
	"rueckgabe_am" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dokument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"objekt_typ" text NOT NULL,
	"objekt_id" uuid NOT NULL,
	"ordner" text,
	"dateiname" text NOT NULL,
	"mime_type" text,
	"speicher_key" text NOT NULL,
	"sha256" text NOT NULL,
	"beschreibung" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eingangsrechnung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handwerkervertrag_id" uuid NOT NULL,
	"rechnungsnr" text NOT NULL,
	"rechnungsdatum" date NOT NULL,
	"eingang_am" date NOT NULL,
	"schlussrechnung" boolean DEFAULT false NOT NULL,
	"betrag_brutto" numeric(14, 2) NOT NULL,
	"geprueft_kumuliert" numeric(14, 2),
	"pruefergebnis" jsonb,
	"status" "rechnung_status" DEFAULT 'erfasst' NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "einheit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" text NOT NULL,
	"typ" "einheit_typ" NOT NULL,
	"bauabschnitt" integer DEFAULT 1,
	"etage" text,
	"art" text,
	"wohnflaeche" numeric(10, 2),
	"miteigentum_tsd" numeric(10, 3),
	"preis_pro_m2" numeric(14, 2),
	"vk_brutto" numeric(14, 2),
	"mindest_vk" numeric(14, 2),
	"reserviert_fuer" uuid,
	"reserviert_bis" date,
	"zugehoerig_zu_einheit_id" uuid,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geschaeftspartner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"suchcode" text NOT NULL,
	"firma" text,
	"anrede" text,
	"vorname" text,
	"nachname" text,
	"strasse" text,
	"plz" text,
	"ort" text,
	"email" text,
	"telefon" text,
	"iban" text,
	"rollen" "partner_rolle"[] DEFAULT '{}' NOT NULL,
	"freistellung_gueltig_bis" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gesellschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"name" text NOT NULL,
	"anschrift" text,
	"datev_beraternr" integer,
	"datev_mandantennr" integer,
	"skr" text DEFAULT '03',
	"sachkontenlaenge" integer DEFAULT 4,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gewerk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"gruppe" text,
	"bezeichnung" text NOT NULL,
	"geschaetzt_brutto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handwerkervertrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gewerk_id" uuid NOT NULL,
	"handwerker_id" uuid,
	"nr_intern" text,
	"angebot_vom" date,
	"vertrag_vom" date,
	"vertrag_brutto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"nachlass_prozent" numeric(7, 4) DEFAULT '0',
	"skonto_prozent" numeric(7, 4) DEFAULT '0',
	"skonto_frist_tage" integer,
	"zahlungsfrist_tage" integer,
	"umlagen" jsonb DEFAULT '{}'::jsonb,
	"einbehalt_ve_prozent" numeric(7, 4) DEFAULT '0',
	"einbehalt_gw_prozent" numeric(7, 4) DEFAULT '0',
	"gewaehrleistung_monate" integer,
	"abnahme_am" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kaufvertrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" text NOT NULL,
	"urkundennr" text,
	"datum" date,
	"zahlungsanforderung_an" uuid,
	"erbbaurecht" boolean DEFAULT false NOT NULL,
	"vertrag_wirksam" boolean DEFAULT false NOT NULL,
	"vormerkung_eingetragen_am" date,
	"lastenfreistellung_gesichert" boolean DEFAULT false NOT NULL,
	"buergschaft_nach_7" boolean DEFAULT false NOT NULL,
	"zahlungsziel_tage" integer DEFAULT 10 NOT NULL,
	"verzugszins_prozent" numeric(7, 4),
	"anforderungssperre" boolean DEFAULT false NOT NULL,
	"mahnsperre" boolean DEFAULT false NOT NULL,
	"uebergabe_ist" timestamp with time zone,
	"gewaehrleistung_bis" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kaufvertrag_einheit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kaufvertrag_id" uuid NOT NULL,
	"einheit_id" uuid NOT NULL,
	"vk_brutto" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kaufvertrag_kaeufer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kaufvertrag_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"anteil_prozent" numeric(7, 4) DEFAULT '100' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mangel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"einheit_id" uuid,
	"gewerk_id" uuid,
	"handwerker_id" uuid,
	"kaufvertrag_id" uuid,
	"eigentum" text DEFAULT 'sonder' NOT NULL,
	"festgestellt_am" date NOT NULL,
	"festgestellt_durch" text,
	"titel" text NOT NULL,
	"beschreibung" text,
	"mangelart" text,
	"wert_handwerker_brutto" numeric(14, 2) DEFAULT '0',
	"wert_kunde_brutto" numeric(14, 2) DEFAULT '0',
	"einbehalt" boolean DEFAULT false NOT NULL,
	"ersatzvornahme_am" date,
	"erledigt_am" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nachtrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handwerkervertrag_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"text" text NOT NULL,
	"betrag_brutto" numeric(14, 2) NOT NULL,
	"status" "nachtrag_status" DEFAULT 'angeboten' NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projekt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"suchcode" text NOT NULL,
	"strasse" text,
	"plz" text,
	"ort" text,
	"art" "projektart" DEFAULT 'bautraeger' NOT NULL,
	"para13b_anwendbar" boolean DEFAULT false NOT NULL,
	"grundbuchamt" text,
	"grundbuch_blatt" text,
	"flurstueck" text,
	"kostenstelle" text,
	"projektbeginn" date,
	"baubeginn_soll" date,
	"baubeginn_ist" date,
	"fertigstellung_soll" date,
	"fertigstellung_ist" date,
	"abgeschlossen" boolean DEFAULT false NOT NULL,
	"wahlfelder" jsonb DEFAULT '{}'::jsonb,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kaufvertrag_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"typ" "rate_typ" DEFAULT 'mabv' NOT NULL,
	"abschnitte" text[] DEFAULT '{}' NOT NULL,
	"prozent" numeric(7, 4),
	"betrag" numeric(14, 2) NOT NULL,
	"text" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruege" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mangel_id" uuid NOT NULL,
	"stufe" integer NOT NULL,
	"geruegt_am" date NOT NULL,
	"frist_bis" date NOT NULL,
	"nachfrist_bis" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zahlungsanforderung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_id" uuid NOT NULL,
	"rechnungsnr" text NOT NULL,
	"angefordert_am" date NOT NULL,
	"faellig_am" date NOT NULL,
	"betrag" numeric(14, 2) NOT NULL,
	"mahnstufe" integer DEFAULT 0 NOT NULL,
	"letzte_mahnung_am" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zahlungsausgang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eingangsrechnung_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"betrag" numeric(14, 2) NOT NULL,
	"skonto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bauabzugsteuer" numeric(14, 2) DEFAULT '0' NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zahlungseingang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zahlungsanforderung_id" uuid,
	"kaufvertrag_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"betrag" numeric(14, 2) NOT NULL,
	"verwendungszweck" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bautenstand" ADD CONSTRAINT "bautenstand_einheit_id_einheit_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buergschaft" ADD CONSTRAINT "buergschaft_handwerkervertrag_id_handwerkervertrag_id_fk" FOREIGN KEY ("handwerkervertrag_id") REFERENCES "public"."handwerkervertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buergschaft" ADD CONSTRAINT "buergschaft_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buergschaft" ADD CONSTRAINT "buergschaft_buerge_id_geschaeftspartner_id_fk" FOREIGN KEY ("buerge_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dokument" ADD CONSTRAINT "dokument_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eingangsrechnung" ADD CONSTRAINT "eingangsrechnung_handwerkervertrag_id_handwerkervertrag_id_fk" FOREIGN KEY ("handwerkervertrag_id") REFERENCES "public"."handwerkervertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einheit" ADD CONSTRAINT "einheit_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einheit" ADD CONSTRAINT "einheit_reserviert_fuer_geschaeftspartner_id_fk" FOREIGN KEY ("reserviert_fuer") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geschaeftspartner" ADD CONSTRAINT "geschaeftspartner_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gesellschaft" ADD CONSTRAINT "gesellschaft_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gewerk" ADD CONSTRAINT "gewerk_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handwerkervertrag" ADD CONSTRAINT "handwerkervertrag_gewerk_id_gewerk_id_fk" FOREIGN KEY ("gewerk_id") REFERENCES "public"."gewerk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handwerkervertrag" ADD CONSTRAINT "handwerkervertrag_handwerker_id_geschaeftspartner_id_fk" FOREIGN KEY ("handwerker_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag" ADD CONSTRAINT "kaufvertrag_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag" ADD CONSTRAINT "kaufvertrag_zahlungsanforderung_an_geschaeftspartner_id_fk" FOREIGN KEY ("zahlungsanforderung_an") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag_einheit" ADD CONSTRAINT "kaufvertrag_einheit_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag_einheit" ADD CONSTRAINT "kaufvertrag_einheit_einheit_id_einheit_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag_kaeufer" ADD CONSTRAINT "kaufvertrag_kaeufer_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kaufvertrag_kaeufer" ADD CONSTRAINT "kaufvertrag_kaeufer_partner_id_geschaeftspartner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_einheit_id_einheit_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_gewerk_id_gewerk_id_fk" FOREIGN KEY ("gewerk_id") REFERENCES "public"."gewerk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_handwerker_id_geschaeftspartner_id_fk" FOREIGN KEY ("handwerker_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nachtrag" ADD CONSTRAINT "nachtrag_handwerkervertrag_id_handwerkervertrag_id_fk" FOREIGN KEY ("handwerkervertrag_id") REFERENCES "public"."handwerkervertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projekt" ADD CONSTRAINT "projekt_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate" ADD CONSTRAINT "rate_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruege" ADD CONSTRAINT "ruege_mangel_id_mangel_id_fk" FOREIGN KEY ("mangel_id") REFERENCES "public"."mangel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungsanforderung" ADD CONSTRAINT "zahlungsanforderung_rate_id_rate_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungsausgang" ADD CONSTRAINT "zahlungsausgang_eingangsrechnung_id_eingangsrechnung_id_fk" FOREIGN KEY ("eingangsrechnung_id") REFERENCES "public"."eingangsrechnung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungseingang" ADD CONSTRAINT "zahlungseingang_zahlungsanforderung_id_zahlungsanforderung_id_fk" FOREIGN KEY ("zahlungsanforderung_id") REFERENCES "public"."zahlungsanforderung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungseingang" ADD CONSTRAINT "zahlungseingang_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projekt_nr_je_gesellschaft" ON "projekt" USING btree ("gesellschaft_id","nr");