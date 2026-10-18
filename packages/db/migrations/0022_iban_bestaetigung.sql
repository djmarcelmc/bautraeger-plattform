CREATE TABLE "iban_bestaetigung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"iban" text NOT NULL,
	"rueckruf_am" date NOT NULL,
	"gespraechspartner" text NOT NULL,
	"telefon" text,
	"bemerkung" text,
	"bestaetigt_von" text NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iban_bestaetigung" ADD CONSTRAINT "iban_bestaetigung_partner_id_geschaeftspartner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."geschaeftspartner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "iban_bestaetigung_partner" ON "iban_bestaetigung" USING btree ("partner_id");