import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { schema } from "@bt/db";
import { gewaehrleistungBis, mangelStatus, naechsteRuege } from "@bt/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import { KontextService } from "../common/kontext.service.js";
import { DB, type Db } from "../db.provider.js";

const { mangel: m, ruege: r, projekt: p, gesellschaft: g } = schema;
export const heute = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class MaengelService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  /** Rügen je Mangel, aufsteigend nach Stufe. */
  async ruegen(mangelIds: string[]) {
    if (!mangelIds.length) return new Map<string, (typeof r.$inferSelect)[]>();
    const alle = await this.db.select().from(r).where(inArray(r.mangelId, mangelIds)).orderBy(asc(r.stufe));
    const map = new Map<string, (typeof r.$inferSelect)[]>();
    for (const x of alle) map.set(x.mangelId, [...(map.get(x.mangelId) ?? []), x]);
    return map;
  }

  /** Mangel mit Bezügen, Rügen, Status, Gewährleistung und Vorschlag für die nächste Rüge. */
  async mangel(id: string) {
    const [x] = await this.db
      .select({
        mangel: m,
        projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode, strasse: p.strasse, plz: p.plz, ort: p.ort },
        gesellschaft: { id: g.id, name: g.name, anschrift: g.anschrift },
        einheit: { id: schema.einheit.id, nr: schema.einheit.nr, typ: schema.einheit.typ },
        gewerk: { id: schema.gewerk.id, nr: schema.gewerk.nr, bezeichnung: schema.gewerk.bezeichnung },
        vertrag: { id: schema.handwerkervertrag.id, nrIntern: schema.handwerkervertrag.nrIntern, abnahmeAm: schema.handwerkervertrag.abnahmeAm, gewaehrleistungMonate: schema.handwerkervertrag.gewaehrleistungMonate },
        handwerker: schema.geschaeftspartner,
        kaufvertrag: { id: schema.kaufvertrag.id, nr: schema.kaufvertrag.nr },
      })
      .from(m)
      .innerJoin(p, eq(m.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .leftJoin(schema.einheit, eq(m.einheitId, schema.einheit.id))
      .leftJoin(schema.gewerk, eq(m.gewerkId, schema.gewerk.id))
      .leftJoin(schema.handwerkervertrag, eq(m.handwerkervertragId, schema.handwerkervertrag.id))
      .leftJoin(schema.geschaeftspartner, eq(m.handwerkerId, schema.geschaeftspartner.id))
      .leftJoin(schema.kaufvertrag, eq(m.kaufvertragId, schema.kaufvertrag.id))
      .where(and(eq(m.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Mangel nicht gefunden");
    const ruegen = (await this.ruegen([id])).get(id) ?? [];
    const gwBis = x.vertrag?.id ? gewaehrleistungBis(x.vertrag.abnahmeAm, x.vertrag.gewaehrleistungMonate) : null;
    return {
      ...x.mangel,
      projekt: x.projekt,
      gesellschaft: x.gesellschaft,
      einheit: x.einheit?.id ? x.einheit : null,
      gewerk: x.gewerk?.id ? x.gewerk : null,
      vertrag: x.vertrag?.id ? { ...x.vertrag, gewaehrleistungBis: gwBis } : null,
      handwerker: x.handwerker,
      kaufvertrag: x.kaufvertrag?.id ? x.kaufvertrag : null,
      ruegen,
      status: mangelStatus(x.mangel, ruegen, heute()),
      gewaehrleistungAbgelaufen: gwBis ? x.mangel.festgestelltAm > gwBis : null,
      naechsteRuege: x.mangel.erledigtAm ? null : naechsteRuege(ruegen.length, heute()),
    };
  }
}
