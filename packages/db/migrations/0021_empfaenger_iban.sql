ALTER TABLE "zahlungsausgang" ADD COLUMN "empfaenger_iban" text;--> statement-breakpoint
-- bisherige Zahlungsläufe: IBAN des Handwerkers übernehmen (Näherung für Altdaten)
UPDATE "zahlungsausgang" za SET "empfaenger_iban" = gp."iban"
FROM "eingangsrechnung" er, "handwerkervertrag" hv, "geschaeftspartner" gp
WHERE za."eingangsrechnung_id" = er."id" AND er."handwerkervertrag_id" = hv."id" AND hv."handwerker_id" = gp."id" AND za."zahlungslauf_id" IS NOT NULL AND za."empfaenger_iban" IS NULL;
