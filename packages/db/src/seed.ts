/** Fiktive Demodaten für die lokale Entwicklung: `pnpm --filter @bt/db seed` */
import { STANDARD_7_RATEN, money, ratenplanBerechnen } from "@bt/domain";
import { verbinden } from "./index.js";
import * as s from "./schema.js";

const db = verbinden();

const [m] = await db.insert(s.mandant).values({ name: "Demo-Mandant" }).returning();
const [g] = await db
  .insert(s.gesellschaft)
  .values({ mandantId: m!.id, nr: 1, name: "Muster Wohnbau GmbH", datevBeraternr: 1234567, datevMandantennr: 10001 })
  .returning();
const [p] = await db
  .insert(s.projekt)
  .values({ gesellschaftId: g!.id, nr: 101, suchcode: "LINDENWEG", strasse: "Lindenweg 5", plz: "70173", ort: "Stuttgart", kostenstelle: "101" })
  .returning();
const [we] = await db
  .insert(s.einheit)
  .values({ projektId: p!.id, nr: "01", typ: "wohnung", etage: "EG", art: "4 1/2 Zimmer", wohnflaeche: "97.64", vkBrutto: "312448.00" })
  .returning();
const [kaeufer] = await db
  .insert(s.geschaeftspartner)
  .values({ mandantId: m!.id, nr: 10001, suchcode: "MUSTERMANN", vorname: "Erika", nachname: "Mustermann", rollen: ["kunde"] })
  .returning();
const [kv] = await db
  .insert(s.kaufvertrag)
  .values({ projektId: p!.id, nr: "KV-1", datum: "2026-03-01", zahlungsanforderungAn: kaeufer!.id, vertragWirksam: true, lastenfreistellungGesichert: true, vormerkungEingetragenAm: "2026-04-01" })
  .returning();
await db.insert(s.kaufvertragEinheit).values({ kaufvertragId: kv!.id, einheitId: we!.id, vkBrutto: "312448.00" });

const plan = ratenplanBerechnen(money("312448.00"), STANDARD_7_RATEN);
const raten = await db
  .insert(s.rate)
  .values(plan.map((r) => ({ kaufvertragId: kv!.id, nr: r.nr, abschnitte: r.abschnitte, prozent: r.prozent.toFixed(4), betrag: r.betrag.toFixed(2), text: r.bezeichnung })))
  .returning();

// Rate 1 angefordert und bezahlt, Rate 2 angefordert und überfällig
const [za1] = await db
  .insert(s.zahlungsanforderung)
  .values({ rateId: raten[0]!.id, rechnungsnr: "ZA-1001", angefordertAm: "2026-05-01", faelligAm: "2026-05-11", betrag: raten[0]!.betrag })
  .returning();
await db.insert(s.zahlungseingang).values({ zahlungsanforderungId: za1!.id, kaufvertragId: kv!.id, datum: "2026-05-09", betrag: raten[0]!.betrag });
await db
  .insert(s.zahlungsanforderung)
  .values({ rateId: raten[1]!.id, rechnungsnr: "ZA-1002", angefordertAm: "2026-09-01", faelligAm: "2026-09-11", betrag: raten[1]!.betrag });

console.log("Demodaten angelegt: Projekt 101 LINDENWEG, Kaufvertrag KV-1 mit 7 Raten.");
process.exit(0);
