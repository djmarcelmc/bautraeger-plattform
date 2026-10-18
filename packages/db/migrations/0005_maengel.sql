ALTER TABLE "mangel" ADD COLUMN "handwerkervertrag_id" uuid;--> statement-breakpoint
ALTER TABLE "mangel" ADD COLUMN "ort" text;--> statement-breakpoint
ALTER TABLE "mangel" ADD COLUMN "angebotsanforderung_am" date;--> statement-breakpoint
ALTER TABLE "mangel" ADD COLUMN "auftragserteilung_am" date;--> statement-breakpoint
ALTER TABLE "mangel" ADD COLUMN "erledigt_von" text;--> statement-breakpoint
ALTER TABLE "ruege" ADD COLUMN "bemerkung" text;--> statement-breakpoint
ALTER TABLE "mangel" ADD CONSTRAINT "mangel_handwerkervertrag_id_handwerkervertrag_id_fk" FOREIGN KEY ("handwerkervertrag_id") REFERENCES "public"."handwerkervertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mangel_nr_je_projekt" ON "mangel" USING btree ("projekt_id","nr");--> statement-breakpoint
CREATE UNIQUE INDEX "ruege_stufe_je_mangel" ON "ruege" USING btree ("mangel_id","stufe");