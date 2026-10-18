ALTER TABLE "buchung" ADD COLUMN "storno_von" uuid;--> statement-breakpoint
ALTER TABLE "gesellschaft" ADD COLUMN "kontierung" jsonb;--> statement-breakpoint
ALTER TABLE "buchung" ADD CONSTRAINT "buchung_storno_von_buchung_id_fk" FOREIGN KEY ("storno_von") REFERENCES "public"."buchung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buchung_quelle" ON "buchung" USING btree ("gesellschaft_id","quelle_typ","quelle_id");--> statement-breakpoint
CREATE INDEX "buchung_datum" ON "buchung" USING btree ("gesellschaft_id","belegdatum");