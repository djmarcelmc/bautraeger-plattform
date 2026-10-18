CREATE TABLE "einstellung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"schluessel" text NOT NULL,
	"wert" jsonb NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nachricht" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandant_id" uuid NOT NULL,
	"an" text[] NOT NULL,
	"betreff" text NOT NULL,
	"text" text NOT NULL,
	"html" text,
	"anlass" text NOT NULL,
	"bezug_id" uuid,
	"status" text DEFAULT 'wartend' NOT NULL,
	"versuche" integer DEFAULT 0 NOT NULL,
	"naechster_versuch_am" timestamp with time zone DEFAULT now() NOT NULL,
	"fehler" text,
	"gesendet_am" timestamp with time zone,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "einstellung" ADD CONSTRAINT "einstellung_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nachricht" ADD CONSTRAINT "nachricht_mandant_id_mandant_id_fk" FOREIGN KEY ("mandant_id") REFERENCES "public"."mandant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "einstellung_je_mandant" ON "einstellung" USING btree ("mandant_id","schluessel");