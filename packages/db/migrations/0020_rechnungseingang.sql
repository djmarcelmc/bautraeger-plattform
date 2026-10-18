CREATE TYPE "public"."belegeingang_status" AS ENUM('neu', 'erfasst', 'verworfen');--> statement-breakpoint
CREATE TABLE "belegeingang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"quelle" text NOT NULL,
	"herkunft" text,
	"absender" text,
	"betreff" text,
	"empfangen_am" timestamp with time zone DEFAULT now() NOT NULL,
	"dokument_id" uuid NOT NULL,
	"dateiname" text NOT NULL,
	"daten" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text,
	"status" "belegeingang_status" DEFAULT 'neu' NOT NULL,
	"eingangsrechnung_id" uuid,
	"bemerkung" text,
	"erledigt_von" text,
	"erledigt_am" timestamp with time zone,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "belegeingang" ADD CONSTRAINT "belegeingang_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belegeingang" ADD CONSTRAINT "belegeingang_dokument_id_dokument_id_fk" FOREIGN KEY ("dokument_id") REFERENCES "public"."dokument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belegeingang" ADD CONSTRAINT "belegeingang_eingangsrechnung_id_eingangsrechnung_id_fk" FOREIGN KEY ("eingangsrechnung_id") REFERENCES "public"."eingangsrechnung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "belegeingang_herkunft" ON "belegeingang" USING btree ("mandant_id","herkunft") WHERE "belegeingang"."herkunft" is not null;--> statement-breakpoint
CREATE INDEX "belegeingang_status" ON "belegeingang" USING btree ("mandant_id","status");