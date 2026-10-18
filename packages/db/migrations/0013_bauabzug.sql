CREATE TABLE "bauabzug_anmeldung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"handwerker_id" uuid NOT NULL,
	"monat" text NOT NULL,
	"gegenleistung" numeric(14, 2) NOT NULL,
	"abzugsbetrag" numeric(14, 2) NOT NULL,
	"angemeldet_am" date NOT NULL,
	"abgefuehrt_am" date,
	"bemerkung" text,
	"angemeldet_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geschaeftspartner" ADD COLUMN "steuernummer" text;--> statement-breakpoint
ALTER TABLE "geschaeftspartner" ADD COLUMN "finanzamt" text;--> statement-breakpoint
ALTER TABLE "gesellschaft" ADD COLUMN "steuernummer" text;--> statement-breakpoint
ALTER TABLE "bauabzug_anmeldung" ADD CONSTRAINT "bauabzug_anmeldung_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bauabzug_anmeldung" ADD CONSTRAINT "bauabzug_anmeldung_handwerker_id_geschaeftspartner_id_fk" FOREIGN KEY ("handwerker_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bauabzug_anmeldung_eindeutig" ON "bauabzug_anmeldung" USING btree ("gesellschaft_id","handwerker_id","monat");