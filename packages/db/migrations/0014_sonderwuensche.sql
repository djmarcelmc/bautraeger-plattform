CREATE TYPE "public"."sonderwunsch_status" AS ENUM('angebot', 'beauftragt', 'abgelehnt');--> statement-breakpoint
CREATE TABLE "sonderwunsch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kaufvertrag_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"art" "rate_typ" DEFAULT 'zusatzleistung' NOT NULL,
	"bezeichnung" text NOT NULL,
	"beschreibung" text,
	"betrag_brutto" numeric(14, 2) NOT NULL,
	"kosten_brutto" numeric(14, 2),
	"gewerk_id" uuid,
	"abschnitt" text,
	"status" "sonderwunsch_status" DEFAULT 'angebot' NOT NULL,
	"angebot_am" date,
	"gueltig_bis" date,
	"entschieden_am" date,
	"rate_id" uuid,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sonderwunsch" ADD CONSTRAINT "sonderwunsch_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sonderwunsch" ADD CONSTRAINT "sonderwunsch_gewerk_id_gewerk_id_fk" FOREIGN KEY ("gewerk_id") REFERENCES "public"."gewerk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sonderwunsch" ADD CONSTRAINT "sonderwunsch_rate_id_rate_id_fk" FOREIGN KEY ("rate_id") REFERENCES "public"."rate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sonderwunsch_nr_je_vertrag" ON "sonderwunsch" USING btree ("kaufvertrag_id","nr");