import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { ProjektEingabe, ProjektKopieren } from "@bt/domain";
import { and, asc, eq, exists, ilike, max, or, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const p = schema.projekt;
const g = schema.gesellschaft;
const e = schema.einheit;

@Controller("projekte")
export class ProjekteController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  @Get()
  async liste(@Query("suche") suche?: string, @Query("abgeschlossen") abgeschlossen?: string) {
    const mandantId = await this.kontext.mandantId();
    const muster = suche ? `%${suche.trim()}%` : undefined;
    return this.db
      .select({
        id: p.id,
        nr: p.nr,
        suchcode: p.suchcode,
        strasse: p.strasse,
        plz: p.plz,
        ort: p.ort,
        art: p.art,
        abgeschlossen: p.abgeschlossen,
        baubeginnIst: p.baubeginnIst,
        gesellschaftNr: g.nr,
        gesellschaft: g.name,
        einheiten: sql<number>`(select count(*)::int from ${e} where ${e.projektId} = ${p.id})`,
      })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, mandantId),
          abgeschlossen === "alle" ? undefined : eq(p.abgeschlossen, abgeschlossen === "ja"),
          muster
            ? or(ilike(p.suchcode, muster), ilike(p.ort, muster), ilike(p.strasse, muster), sql`${p.nr}::text like ${muster}`)
            : undefined,
        ),
      )
      .orderBy(asc(p.nr));
  }

  @Get("naechste-nr")
  async naechsteNr(@Query("gesellschaftId", new ParseUUIDPipe()) gesellschaftId: string) {
    const [r] = await this.db.select({ m: max(p.nr) }).from(p).where(eq(p.gesellschaftId, gesellschaftId));
    return { nr: (r?.m ?? 100) + 1 };
  }

  private async laden(id: string) {
    const [r] = await this.db
      .select({ projekt: p, gesellschaft: g })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(p.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Projekt nicht gefunden");
    return r;
  }

  /** Projekt mit Gesellschaft, Einheiten (inkl. Verkaufsstatus) und Übersicht je Einheitentyp. */
  @Get(":id")
  async eins(@Param("id", ParseUUIDPipe) id: string) {
    const { projekt, gesellschaft } = await this.laden(id);
    const einheiten = await this.db
      .select({
        id: e.id,
        nr: e.nr,
        typ: e.typ,
        bauabschnitt: e.bauabschnitt,
        etage: e.etage,
        art: e.art,
        wohnflaeche: e.wohnflaeche,
        vkBrutto: e.vkBrutto,
        zugehoerigZuEinheitId: e.zugehoerigZuEinheitId,
        verkauft: exists(
          this.db.select({ x: sql`1` }).from(schema.kaufvertragEinheit).where(eq(schema.kaufvertragEinheit.einheitId, e.id)),
        ).mapWith(Boolean),
      })
      .from(e)
      .where(eq(e.projektId, id))
      .orderBy(asc(e.bauabschnitt), asc(e.nr));
    const uebersicht: Record<string, { anzahl: number; verkauft: number }> = {};
    for (const x of einheiten) {
      const u = (uebersicht[x.typ] ??= { anzahl: 0, verkauft: 0 });
      u.anzahl++;
      if (x.verkauft) u.verkauft++;
    }
    return { ...projekt, gesellschaft: { id: gesellschaft.id, nr: gesellschaft.nr, name: gesellschaft.name }, einheiten, uebersicht };
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(ProjektEingabe, body);
    await this.gesellschaftPruefen(werte.gesellschaftId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx
        .insert(p)
        .values({ ...werte, kostenstelle: werte.kostenstelle ?? String(werte.nr) })
        .returning();
      await protokollieren(tx, { tabelle: "projekt", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(ProjektEingabe, body);
    const { projekt: alt } = await this.laden(id);
    await this.gesellschaftPruefen(werte.gesellschaftId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(p).set({ ...werte, geaendertAm: new Date() }).where(eq(p.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "projekt", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  /** Kopiert ein Projekt (Stammdaten, optional Einheiten und Gewerke mit Schätzkosten). */
  @Post(":id/kopieren")
  async kopieren(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const opt = pruefe(ProjektKopieren, body);
    const { projekt: quelle } = await this.laden(id);
    return this.db.transaction(async (tx) => {
      const { id: _id, angelegtAm: _a, geaendertAm: _g, ...stamm } = quelle;
      void _id;
      void _a;
      void _g;
      const [neu] = await tx
        .insert(p)
        .values({
          ...stamm,
          nr: opt.nr,
          suchcode: opt.suchcode,
          kostenstelle: String(opt.nr),
          abgeschlossen: false,
          baubeginnIst: null,
          fertigstellungIst: null,
        })
        .returning();
      let einheiten = 0;
      let gewerke = 0;
      if (opt.einheitenKopieren) {
        const alt = await tx.select().from(e).where(eq(e.projektId, id));
        const neueIds = new Map<string, string>();
        for (const x of alt) {
          const { id: altId, angelegtAm: _x, geaendertAm: _y, ...rest } = x;
          void _x;
          void _y;
          const [k] = await tx
            .insert(e)
            .values({ ...rest, projektId: neu!.id, reserviertFuer: null, reserviertBis: null, zugehoerigZuEinheitId: null })
            .returning({ id: e.id });
          neueIds.set(altId, k!.id);
        }
        for (const x of alt)
          if (x.zugehoerigZuEinheitId && neueIds.has(x.zugehoerigZuEinheitId))
            await tx
              .update(e)
              .set({ zugehoerigZuEinheitId: neueIds.get(x.zugehoerigZuEinheitId)! })
              .where(eq(e.id, neueIds.get(x.id)!));
        einheiten = alt.length;
      }
      if (opt.gewerkeKopieren) {
        const alt = await tx.select().from(schema.gewerk).where(eq(schema.gewerk.projektId, id));
        if (alt.length)
          await tx.insert(schema.gewerk).values(
            alt.map(({ id: _i, angelegtAm: _x, geaendertAm: _y, ...rest }) => ({ ...rest, projektId: neu!.id })),
          );
        gewerke = alt.length;
      }
      await protokollieren(tx, {
        tabelle: "projekt",
        id: neu!.id,
        aktion: "insert",
        neu: { kopiertVon: quelle.nr, ...opt, einheiten, gewerke },
        benutzer,
      });
      return { ...neu, kopiert: { einheiten, gewerke } };
    });
  }

  private async gesellschaftPruefen(gesellschaftId: string) {
    const [x] = await this.db
      .select({ id: g.id })
      .from(g)
      .where(and(eq(g.id, gesellschaftId), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Gesellschaft nicht gefunden");
  }
}
