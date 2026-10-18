CREATE TYPE "public"."bankumsatz_status" AS ENUM('offen', 'zugeordnet', 'ignoriert');--> statement-breakpoint
CREATE TABLE "bankimport" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"dateiname" text NOT NULL,
	"format" text NOT NULL,
	"konto_iban" text,
	"von" date,
	"bis" date,
	"anzahl" integer NOT NULL,
	"neu" integer NOT NULL,
	"importiert_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bankumsatz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gesellschaft_id" uuid NOT NULL,
	"bankimport_id" uuid NOT NULL,
	"schluessel" text NOT NULL,
	"buchungsdatum" date NOT NULL,
	"valuta" date,
	"betrag" numeric(14, 2) NOT NULL,
	"waehrung" text DEFAULT 'EUR' NOT NULL,
	"name" text,
	"iban" text,
	"verwendungszweck" text DEFAULT '' NOT NULL,
	"end_to_end_id" text,
	"bankreferenz" text,
	"status" "bankumsatz_status" DEFAULT 'offen' NOT NULL,
	"zahlungslauf_id" uuid,
	"zahlungsausgang_id" uuid,
	"bemerkung" text,
	"zugeordnet_von" text,
	"zugeordnet_am" timestamp with time zone,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zahlungseingang" ADD COLUMN "bankumsatz_id" uuid;--> statement-breakpoint
ALTER TABLE "bankimport" ADD CONSTRAINT "bankimport_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankumsatz" ADD CONSTRAINT "bankumsatz_gesellschaft_id_gesellschaft_id_fk" FOREIGN KEY ("gesellschaft_id") REFERENCES "public"."gesellschaft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankumsatz" ADD CONSTRAINT "bankumsatz_bankimport_id_bankimport_id_fk" FOREIGN KEY ("bankimport_id") REFERENCES "public"."bankimport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankumsatz" ADD CONSTRAINT "bankumsatz_zahlungslauf_id_zahlungslauf_id_fk" FOREIGN KEY ("zahlungslauf_id") REFERENCES "public"."zahlungslauf"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankumsatz" ADD CONSTRAINT "bankumsatz_zahlungsausgang_id_zahlungsausgang_id_fk" FOREIGN KEY ("zahlungsausgang_id") REFERENCES "public"."zahlungsausgang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bankumsatz_schluessel" ON "bankumsatz" USING btree ("gesellschaft_id","schluessel");--> statement-breakpoint
CREATE INDEX "bankumsatz_status" ON "bankumsatz" USING btree ("gesellschaft_id","status");--> statement-breakpoint
ALTER TABLE "zahlungseingang" ADD CONSTRAINT "zahlungseingang_bankumsatz_id_bankumsatz_id_fk" FOREIGN KEY ("bankumsatz_id") REFERENCES "public"."bankumsatz"("id") ON DELETE no action ON UPDATE no action;