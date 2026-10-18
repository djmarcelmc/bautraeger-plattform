import { Inject, Injectable } from "@nestjs/common";
import { schema } from "@bt/db";
import { BUERGSCHAFT_ART_TEXT, buergschaftStatus, rueckgabeFaelligAb, type BuergschaftArt } from "@bt/domain";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";

const { buergschaft: b, handwerkervertrag: hv, gewerk: gw, kaufvertrag: kv, geschaeftspartner: gp } = schema;
const p1 = alias(schema.projekt, "p1");
const p2 = alias(schema.projekt, "p2");
const g1 = alias(schema.gesellschaft, "g1");
const g2 = alias(schema.gesellschaft, "g2");
const hw = alias(schema.geschaeftspartner, "hw");
const heute = () => new Date().toISOString().slice(0, 10);

/** Bürgschaften mit abgeleitetem Status und Rückgabefälligkeit. */
@Injectable()
export class BuergschaftenService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  async abfrage(filter: { id?: string; projektId?: string; handwerkervertragId?: string; kaufvertragId?: string; richtung?: string }) {
    const mandantId = await this.kontext.mandantId();
    const zeilen = await this.db
      .select({
        b,
        projekt: sql<{ id: string; nr: number; suchcode: string } | null>`case when ${p1.id} is not null then json_build_object('id', ${p1.id}, 'nr', ${p1.nr}, 'suchcode', ${p1.suchcode}) when ${p2.id} is not null then json_build_object('id', ${p2.id}, 'nr', ${p2.nr}, 'suchcode', ${p2.suchcode}) end`,
        bezug: sql<string>`coalesce(${gw.nr} || ' ' || ${gw.bezeichnung} || ' – ' || coalesce(${hw.firma}, ${hw.nachname}, ${hw.suchcode}), 'Kaufvertrag ' || ${kv.nr})`,
        buerge: sql<string | null>`coalesce(${gp.firma}, ${gp.nachname})`,
        abnahmeAm: hv.abnahmeAm,
        gewaehrleistungMonate: hv.gewaehrleistungMonate,
        uebergabeAm: sql<string | null>`to_char(${kv.uebergabeIst} at time zone 'Europe/Berlin', 'YYYY-MM-DD')`,
      })
      .from(b)
      .leftJoin(hv, eq(b.handwerkervertragId, hv.id))
      .leftJoin(gw, eq(hv.gewerkId, gw.id))
      .leftJoin(p1, eq(gw.projektId, p1.id))
      .leftJoin(g1, eq(p1.gesellschaftId, g1.id))
      .leftJoin(hw, eq(hv.handwerkerId, hw.id))
      .leftJoin(kv, eq(b.kaufvertragId, kv.id))
      .leftJoin(p2, eq(kv.projektId, p2.id))
      .leftJoin(g2, eq(p2.gesellschaftId, g2.id))
      .leftJoin(gp, eq(b.buergeId, gp.id))
      .where(
        and(
          or(eq(g1.mandantId, mandantId), eq(g2.mandantId, mandantId)),
          filter.id ? eq(b.id, filter.id) : undefined,
          filter.projektId ? or(eq(p1.id, filter.projektId), eq(p2.id, filter.projektId)) : undefined,
          filter.handwerkervertragId ? eq(b.handwerkervertragId, filter.handwerkervertragId) : undefined,
          filter.kaufvertragId ? eq(b.kaufvertragId, filter.kaufvertragId) : undefined,
          filter.richtung === "erhalten" || filter.richtung === "ausgegeben" ? eq(b.richtung, filter.richtung) : undefined,
        ),
      )
      .orderBy(asc(b.gueltigBis), asc(b.angelegtAm));
    const stichtag = heute();
    return zeilen.map((z) => {
      const faellig = rueckgabeFaelligAb(z.b.art, z);
      return {
        ...z.b,
        artText: BUERGSCHAFT_ART_TEXT[z.b.art as BuergschaftArt] ?? z.b.art,
        projekt: z.projekt,
        bezug: z.bezug,
        buerge: z.buerge,
        rueckgabeFaelligAb: faellig,
        status: buergschaftStatus({ gueltigBis: z.b.gueltigBis, rueckgabeAm: z.b.rueckgabeAm, rueckgabeFaelligAb: faellig }, stichtag),
      };
    });
  }

}
