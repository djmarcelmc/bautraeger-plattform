CREATE TABLE "portalzugang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kaufvertrag_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"gueltig_bis" date NOT NULL,
	"widerrufen_am" timestamp with time zone,
	"letzter_zugriff_am" timestamp with time zone,
	"erstellt_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portalzugang" ADD CONSTRAINT "portalzugang_kaufvertrag_id_kaufvertrag_id_fk" FOREIGN KEY ("kaufvertrag_id") REFERENCES "public"."kaufvertrag"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portalzugang_token" ON "portalzugang" USING btree ("token_hash");