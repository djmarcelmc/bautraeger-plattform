CREATE TABLE "abnahme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"art" text NOT NULL,
	"kaufvertrag_id" uuid,
	"einheit_id" uuid,
	"handwerkervertrag_id" uuid,
	"datum" date NOT NULL,
	"ort" text,
	"teilnehmer" text,
	"bemerkung" text,
	"schluessel" text,
	"zaehler" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ergebnis" text,
	"vorbehalt_vertragsstrafe" boolean DEFAULT false NOT NULL,
	"gewaehrleistung_monate" integer,
	"abgeschlossen_am" timestamp with time zone,
	"abgeschlossen_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mangelvorlage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"kategorie" text NOT NULL,
	"gewerk_nr" integer,
	"titel" text NOT NULL,
	"beschreibung" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mangel" ADD COLUMN "abnahme_id" uuid;--> statement-breakpoint
ALTER TABLE "abnahme" ADD CONSTRAINT "abnahme_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abnahme" ADD CONSTRAINT "abnahme_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abnahme" ADD CONSTRAINT "abnahme_einheit_id_einheit_id_fk" FOREIGN KEY ("einheit_id") REFERENCES "public"."einheit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abnahme" ADD CONSTRAINT "abnahme_handwerkervertrag_id_handwerkervertrag_id_fk" FOREIGN KEY ("handwerkervertrag_id") REFERENCES "public"."handwerkervertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mangelvorlage" ADD CONSTRAINT "mangelvorlage_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abnahme_nr_je_projekt" ON "abnahme" USING btree ("projekt_id","nr");--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_abnahme_id_abnahme_id_fk" FOREIGN KEY ("abnahme_id") REFERENCES "public"."abnahme"("id") ON DELETE no action ON UPDATE no action;