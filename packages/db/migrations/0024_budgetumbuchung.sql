CREATE TABLE "budgetumbuchung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"von_gewerk_id" uuid NOT NULL,
	"nach_gewerk_id" uuid NOT NULL,
	"betrag" numeric(14, 2) NOT NULL,
	"begruendung" text NOT NULL,
	"benutzer" text NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgetumbuchung" ADD CONSTRAINT "budgetumbuchung_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgetumbuchung" ADD CONSTRAINT "budgetumbuchung_von_gewerk_id_gewerk_id_fk" FOREIGN KEY ("von_gewerk_id") REFERENCES "public"."gewerk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgetumbuchung" ADD CONSTRAINT "budgetumbuchung_nach_gewerk_id_gewerk_id_fk" FOREIGN KEY ("nach_gewerk_id") REFERENCES "public"."gewerk"("id") ON DELETE no action ON UPDATE no action;