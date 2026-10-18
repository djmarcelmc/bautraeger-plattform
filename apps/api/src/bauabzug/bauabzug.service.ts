import { Inject, Injectable } from "@nestjs/common";
import { schema } from "@bt/db";
import { bauabzugUebersicht, datumPlusTage } from "@bt/domain";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";

const { zahlungsausgang: za, eingangsrechnung: er, handwerkervertrag: hv, gewerk: gw, projekt: p, gesellschaft: g, geschaeftspartner: gp, bauabzugAnmeldung: ba } = schema;
const heute = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class BauabzugService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  /** Zahlungen mit Bauabzugsteuer ab einem Monat (JJJJ-MM), optional eingeschränkt. */
  async zahlungen(abMonat: string, filter: { gesellschaftId?: string; handwerkerId?: string; monat?: string } = {}) {
    const von = filter.monat ? `${filter.monat}-01` : `${abMonat}-01`;
    const bis = filter.monat ? datumPlusTage(`${filter.monat}-01`, 31).slice(0, 7) : null;
    return this.db
      .select({
        gesellschaftId: g.id,
        handwerkerId: sql<string>`${hv.handwerkerId}`,
        datum: za.datum,
        betrag: za.betrag,
        bauabzugsteuer: za.bauabzugsteuer,
        rechnungsnr: er.rechnungsnr,
        rechnungsdatum: er.rechnungsdatum,
        schlussrechnung: er.schlussrechnung,
        projekt: sql<string>`${p.nr} || ' ' || ${p.suchcode}`,
        gewerk: sql<string>`${gw.nr} || ' ' || ${gw.bezeichnung}`,
      })
      .from(za)
      .innerJoin(er, eq(za.eingangsrechnungId, er.id))
      .innerJoin(hv, eq(er.handwerkervertragId, hv.id))
      .innerJoin(gw, eq(hv.gewerkId, gw.id))
      .innerJoin(p, eq(gw.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, await this.kontext.mandantId()),
          isNotNull(hv.handwerkerId),
          sql`${za.bauabzugsteuer} > 0`,
          gte(za.datum, von),
          bis ? sql`${za.datum} < ${`${bis}-01`}` : undefined,
          filter.gesellschaftId ? eq(g.id, filter.gesellschaftId) : undefined,
          filter.handwerkerId ? eq(hv.handwerkerId, filter.handwerkerId) : undefined,
        ),
      );
  }

  async anmeldungen(abMonat: string) {
    return this.db
      .select({ id: ba.id, gesellschaftId: ba.gesellschaftId, handwerkerId: ba.handwerkerId, monat: ba.monat, gegenleistung: ba.gegenleistung, abzugsbetrag: ba.abzugsbetrag, angemeldetAm: ba.angemeldetAm, abgefuehrtAm: ba.abgefuehrtAm, bemerkung: ba.bemerkung, angemeldetVon: ba.angemeldetVon })
      .from(ba)
      .innerJoin(g, eq(ba.gesellschaftId, g.id))
      .where(and(eq(g.mandantId, await this.kontext.mandantId()), gte(ba.monat, abMonat)));
  }

  /** Monatsübersicht der letzten `monate` Monate mit Namen und Steuerdaten der Beteiligten. */
  async uebersicht(monate = 12, stichtag = heute()) {
    const d = new Date(`${stichtag.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (monate - 1));
    const abMonat = d.toISOString().slice(0, 7);
    const [zahlungen, anmeldungen] = await Promise.all([this.zahlungen(abMonat), this.anmeldungen(abMonat)]);
    const liste = bauabzugUebersicht(zahlungen, anmeldungen, stichtag);
    const gesIds = [...new Set(liste.flatMap((m) => m.zeilen.map((z) => z.gesellschaftId)))];
    const hwIds = [...new Set(liste.flatMap((m) => m.zeilen.map((z) => z.handwerkerId)))];
    const [gesellschaften, handwerker] = await Promise.all([
      gesIds.length ? this.db.select({ id: g.id, nr: g.nr, name: g.name, steuernummer: g.steuernummer }).from(g).where(inArray(g.id, gesIds)) : [],
      hwIds.length
        ? this.db
            .select({ id: gp.id, nr: gp.nr, suchcode: gp.suchcode, firma: gp.firma, vorname: gp.vorname, nachname: gp.nachname, steuernummer: gp.steuernummer, finanzamt: gp.finanzamt, freistellungGueltigBis: gp.freistellungGueltigBis })
            .from(gp)
            .where(inArray(gp.id, hwIds))
        : [],
    ]);
    return { stichtag, monate: liste, gesellschaften, handwerker };
  }
}
