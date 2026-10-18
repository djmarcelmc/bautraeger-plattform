ALTER TABLE "geschaeftspartner" ADD COLUMN "debitor_konto" text;--> statement-breakpoint
ALTER TABLE "geschaeftspartner" ADD COLUMN "kreditor_konto" text;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_debitor_je_mandant" ON "geschaeftspartner" USING btree ("mandant_id","debitor_konto") WHERE "geschaeftspartner"."debitor_konto" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_kreditor_je_mandant" ON "geschaeftspartner" USING btree ("mandant_id","kreditor_konto") WHERE "geschaeftspartner"."kreditor_konto" is not null;