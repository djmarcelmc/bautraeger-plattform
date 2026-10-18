ALTER TABLE "eingangsrechnung" ADD COLUMN "bemerkung" text;--> statement-breakpoint
ALTER TABLE "eingangsrechnung" ADD COLUMN "geprueft_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eingangsrechnung" ADD COLUMN "geprueft_von" text;--> statement-breakpoint
ALTER TABLE "eingangsrechnung" ADD COLUMN "freigegeben_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eingangsrechnung" ADD COLUMN "freigegeben_von" text;--> statement-breakpoint
CREATE UNIQUE INDEX "gewerk_nr_je_projekt" ON "gewerk" USING btree ("projekt_id","nr");