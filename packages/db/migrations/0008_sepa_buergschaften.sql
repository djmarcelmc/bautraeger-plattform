CREATE TABLE "zahlungslauf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"nr" text NOT NULL,
	"ausfuehrung_am" date NOT NULL,
	"anzahl" integer NOT NULL,
	"summe" numeric(14, 2) NOT NULL,
	"xml" text NOT NULL,
	"erstellt_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buergschaft" ADD COLUMN "nr" text;--> statement-breakpoint
ALTER TABLE "buergschaft" ADD COLUMN "ausgestellt_am" date;--> statement-breakpoint
ALTER TABLE "buergschaft" ADD COLUMN "bemerkung" text;--> statement-breakpoint
ALTER TABLE "geschaeftspartner" ADD COLUMN "bic" text;--> statement-breakpoint
ALTER TABLE "gesellschaft" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "gesellschaft" ADD COLUMN "bic" text;--> statement-breakpoint
ALTER TABLE "zahlungsausgang" ADD COLUMN "zahlungslauf_id" uuid;--> statement-breakpoint
ALTER TABLE "zahlungslauf" ADD CONSTRAINT "zahlungslauf_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zahlungsausgang" ADD CONSTRAINT "zahlungsausgang_zahlungslauf_id_zahlungslauf_id_fk" FOREIGN KEY ("zahlungslauf_id") REFERENCES "public"."zahlungslauf"("id") ON DELETE no action ON UPDATE no action;