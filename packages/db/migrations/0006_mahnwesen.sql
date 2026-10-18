CREATE TABLE "basiszins" (
	"gueltig_ab" date PRIMARY KEY NOT NULL,
	"satz" numeric(5, 2) NOT NULL,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mahnung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zahlungsanforderung_id" uuid NOT NULL,
	"stufe" integer NOT NULL,
	"datum" date NOT NULL,
	"frist_bis" date NOT NULL,
	"offener_betrag" numeric(14, 2) NOT NULL,
	"verzugszinsen" numeric(14, 2) DEFAULT '0' NOT NULL,
	"mahngebuehr" numeric(14, 2) DEFAULT '0' NOT NULL,
	"erstellt_von" text,
	"angelegt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kaufvertrag" ADD COLUMN "verbraucher" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "mahnung" ADD CONSTRAINT "mahnung_zahlungsanforderung_id_zahlungsanforderung_id_fk" FOREIGN KEY ("zahlungsanforderung_id") REFERENCES "public"."zahlungsanforderung"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mahnung_stufe_je_anforderung" ON "mahnung" USING btree ("zahlungsanforderung_id","stufe");--> statement-breakpoint
-- Basiszinssätze nach § 247 BGB (Deutsche Bundesbank), Stand 01.07.2026
INSERT INTO "basiszins" ("gueltig_ab", "satz") VALUES ('2015-01-01', -0.83), ('2016-07-01', -0.88), ('2023-01-01', 1.62), ('2023-07-01', 3.12), ('2024-01-01', 3.62), ('2024-07-01', 3.37), ('2025-01-01', 2.27), ('2025-07-01', 1.27), ('2026-01-01', 1.27), ('2026-07-01', 1.52) ON CONFLICT DO NOTHING;
