CREATE TABLE "vorgang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projekt_id" uuid NOT NULL,
	"nr" integer NOT NULL,
	"bezeichnung" text NOT NULL,
	"gewerk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"mabv_abschnitt" text,
	"beginn" date NOT NULL,
	"ende" date NOT NULL,
	"ende_ist" date,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vorgang" ADD CONSTRAINT "vorgang_projekt_id_projekt_id_fk" FOREIGN KEY ("projekt_id") REFERENCES "public"."projekt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vorgang_abschnitt_je_projekt" ON "vorgang" USING btree ("projekt_id","mabv_abschnitt") WHERE "vorgang"."mabv_abschnitt" is not null;