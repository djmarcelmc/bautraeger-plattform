import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema } from "@bt/db";
import { IBAN_AENDERUNG_FRIST_TAGE, datumPlusTage, rueckrufOffen, type IbanAenderung, type IbanBestaetigung } from "@bt/domain";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { protokollieren } from "../common/protokoll.js";
import { anmeldungAktiv } from "../common/rechte.guard.js";
import { DB, type Db } from "../db.provider.js";

const { aenderungsprotokoll: ap, ibanBestaetigung: ib, geschaeftspartner: gp } = schema;
const heute = () => new Date().toISOString().slice(0, 10);
const norm = (s: string | null | undefined) => (s ? s.replace(/\s/g, "").toUpperCase() : null);

const RueckrufEingabe = z.object({
  rueckrufAm: z.iso.date("Datum des Rückrufs angeben"),
  gespraechspartner: z.string().trim().min(2, "Gesprächspartner angeben").max(120),
  telefon: z.string().trim().max(60).optional().transform((s) => s || null),
  bemerkung: z.string().trim().max(500).optional().transform((s) => s || null),
});

/** IBAN-Änderungen (aus dem Änderungsprotokoll) und dokumentierte Rückrufe je Geschäftspartner. */
@Injectable()
export class IbanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  async aenderungen(partnerIds: string[]): Promise<Map<string, IbanAenderung[]>> {
    const m = new Map<string, IbanAenderung[]>();
    if (!partnerIds.length) return m;
    const zeilen = await this.db
      .select({ id: ap.datensatzId, am: ap.zeitpunkt, von: ap.benutzer, aktion: ap.aktion, alt: sql<string | null>`${ap.alt}->>'iban'`, neu: sql<string | null>`${ap.neu}->>'iban'` })
      .from(ap)
      .where(and(eq(ap.tabelle, "geschaeftspartner"), inArray(ap.datensatzId, partnerIds), sql`${ap.neu} ? 'iban'`));
    for (const z2 of zeilen) m.set(z2.id, [...(m.get(z2.id) ?? []), { am: z2.am.toISOString(), von: z2.von, alt: z2.alt, neu: z2.neu, angelegt: z2.aktion === "insert" }]);
    return m;
  }

  async bestaetigungen(partnerIds: string[]): Promise<Map<string, (IbanBestaetigung & { rueckrufAm: string; telefon: string | null; bemerkung: string | null })[]>> {
    const m = new Map<string, (IbanBestaetigung & { rueckrufAm: string; telefon: string | null; bemerkung: string | null })[]>();
    if (!partnerIds.length) return m;
    const zeilen = await this.db.select().from(ib).where(inArray(ib.partnerId, partnerIds)).orderBy(desc(ib.angelegtAm));
    for (const b of zeilen)
      m.set(b.partnerId, [...(m.get(b.partnerId) ?? []), { iban: b.iban, am: b.angelegtAm.toISOString(), von: b.bestaetigtVon, gespraechspartner: b.gespraechspartner, rueckrufAm: b.rueckrufAm, telefon: b.telefon, bemerkung: b.bemerkung }]);
    return m;
  }

  private async partner(id: string) {
    const [p] = await this.db.select().from(gp).where(and(eq(gp.id, id), eq(gp.mandantId, await this.kontext.mandantId())));
    if (!p) throw new NotFoundException("Geschäftspartner nicht gefunden");
    return p;
  }

  /** Stand der Bankverbindung: letzte Änderung, ob ein Rückruf fehlt, bisherige Rückrufe. */
  async status(partnerId: string) {
    const p = await this.partner(partnerId);
    const [aend, best] = await Promise.all([this.aenderungen([partnerId]), this.bestaetigungen([partnerId])]);
    const aenderungen = (aend.get(partnerId) ?? []).filter((a) => !a.angelegt && norm(a.neu) !== norm(a.alt)).sort((a, b) => b.am.localeCompare(a.am));
    const bestaetigungen = best.get(partnerId) ?? [];
    const offen = rueckrufOffen({ iban: p.iban, aenderungen, bestaetigungen, stichtag: heute(), vierAugen: anmeldungAktiv() });
    return { iban: p.iban, letzteAenderung: aenderungen[0] ?? null, offen, bestaetigungen, fristTage: IBAN_AENDERUNG_FRIST_TAGE };
  }

  /** Rückruf für die aktuelle IBAN dokumentieren (mit Anmeldung: nicht durch die Person, die die IBAN geändert hat). */
  async bestaetigen(partnerId: string, body: unknown, benutzer: string) {
    const e = pruefe(RueckrufEingabe, body);
    const p = await this.partner(partnerId);
    if (!p.iban) throw new BadRequestException("Beim Geschäftspartner ist keine IBAN hinterlegt.");
    if (e.rueckrufAm > heute()) throw new BadRequestException("Der Rückruf kann nicht in der Zukunft liegen.");
    const s = await this.status(partnerId);
    if (anmeldungAktiv() && s.letzteAenderung?.von === benutzer)
      throw new ConflictException("Vier-Augen-Prinzip: Den Rückruf muss eine andere Person dokumentieren als die, die die IBAN geändert hat.");
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.insert(ib).values({ partnerId, iban: norm(p.iban)!, ...e, bestaetigtVon: benutzer }).returning();
      await protokollieren(tx, { tabelle: "geschaeftspartner", id: partnerId, aktion: "update", neu: { ibanRueckruf: { iban: neu!.iban, am: e.rueckrufAm, mit: e.gespraechspartner, telefon: e.telefon } }, benutzer });
      return neu;
    });
  }

  /** Partner mit kürzlich geänderter IBAN ohne gültigen Rückruf (fürs Cockpit). */
  async offeneRueckrufe() {
    const mandantId = await this.kontext.mandantId();
    const grenze = new Date(`${datumPlusTage(heute(), -IBAN_AENDERUNG_FRIST_TAGE)}T00:00:00Z`);
    const kandidaten = await this.db
      .selectDistinct({ id: ap.datensatzId })
      .from(ap)
      .innerJoin(gp, eq(gp.id, ap.datensatzId))
      .where(and(eq(ap.tabelle, "geschaeftspartner"), eq(ap.aktion, "update"), sql`${ap.neu} ? 'iban'`, gte(ap.zeitpunkt, grenze), eq(gp.mandantId, mandantId)));
    const ids = kandidaten.map((k) => k.id);
    if (!ids.length) return [];
    const [partner, aend, best] = await Promise.all([this.db.select({ id: gp.id, name: sql<string>`coalesce(${gp.firma}, concat_ws(' ', ${gp.vorname}, ${gp.nachname}), ${gp.suchcode})`, iban: gp.iban }).from(gp).where(inArray(gp.id, ids)), this.aenderungen(ids), this.bestaetigungen(ids)]);
    return partner.flatMap((p) => {
      const a = rueckrufOffen({ iban: p.iban, aenderungen: aend.get(p.id) ?? [], bestaetigungen: best.get(p.id) ?? [], stichtag: heute(), vierAugen: anmeldungAktiv() });
      return a ? [{ ...p, aenderung: a }] : [];
    });
  }
}
