CREATE UNIQUE INDEX "einheit_nr_je_projekt" ON "einheit" USING btree ("projekt_id","nr");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_nr_je_mandant" ON "geschaeftspartner" USING btree ("mandant_id","nr");--> statement-breakpoint
CREATE UNIQUE INDEX "gesellschaft_nr_je_mandant" ON "gesellschaft" USING btree ("mandant_id","nr");