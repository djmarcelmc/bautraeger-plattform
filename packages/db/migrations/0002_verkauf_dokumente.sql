CREATE TABLE "nummernkreis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"art" text NOT NULL,
	"jahr" integer NOT NULL,
	"letzte" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zahlungsanforderung" ALTER COLUMN "rate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dokument" ADD COLUMN "groesse" integer;--> statement-breakpoint
ALTER TABLE "dokument" ADD COLUMN "hochgeladen_von" text;--> statement-breakpoint
ALTER TABLE "dokument" ADD COLUMN "geloescht_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dokument" ADD COLUMN "geloescht_von" text;--> statement-breakpoint
ALTER TABLE "rate" ADD COLUMN "zahlungsanforderung_id" uuid;--> statement-breakpoint
ALTER TABLE "zahlungsanforderung" ADD COLUMN "kaufvertrag_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "nummernkreis" ADD CONSTRAINT "nummernkreis_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nummernkreis_eindeutig" ON "nummernkreis" USING btree ("gesellschaft_id","art","jahr");--> statement-breakpoint
ALTER TABLE "rate" ADD CONSTRAINT "rate_zahlungsanforderung_id_zahlungsanforderung_id_fk" FOREIGN KEY ("zahlungsanforderung_id") REFERENCES "public"."zahlungsanforderung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungsanforderung" ADD CONSTRAINT "zahlungsanforderung_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bautenstand_einheit_abschnitt" ON "bautenstand" USING btree ("einheit_id","abschnitt");--> statement-breakpoint
CREATE UNIQUE INDEX "kaufvertrag_nr_je_projekt" ON "kaufvertrag" USING btree ("projekt_id","nr");--> statement-breakpoint
CREATE UNIQUE INDEX "einheit_nur_ein_kaufvertrag" ON "kaufvertrag_einheit" USING btree ("einheit_id");