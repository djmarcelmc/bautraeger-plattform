import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { BUERGSCHAFT_ART_TEXT, BuergschaftEingabe, buergschaftStatus, money, rueckgabeFaelligAb, summe, type BuergschaftArt, type BuergschaftEingabe as Werte } from "@bt/domain";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const { buergschaft: b, handwerkervertrag: hv, gewerk: gw, kaufvertrag: kv, geschaeftspartner: gp } = schema;
const p1 = alias(schema.projekt, "p1");
const p2 = alias(schema.projekt, "p2");
const g1 = alias(schema.gesellschaft, "g1");
const g2 = alias(schema.gesellschaft, "g2");
const hw = alias(schema.geschaeftspartner, "hw");
const heute = () => new Date().toISOString().slice(0, 10);
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

@Controller("buergschaften")
export class BuergschaftenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  private async abfrage(filter: { id?: string; projektId?: string; handwerkervertragId?: string; kaufvertragId?: string; richtung?: string }) {
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

  /** Bezug (Vertrag) und Bürge müssen zum Mandanten gehören. */
  private async pruefeBezug(w: Werte) {
    const mandantId = await this.kontext.mandantId();
    if (w.handwerkervertragId) {
      const [x] = await this.db
        .select({ id: hv.id })
        .from(hv)
        .innerJoin(gw, eq(hv.gewerkId, gw.id))
        .innerJoin(p1, eq(gw.projektId, p1.id))
        .innerJoin(g1, eq(p1.gesellschaftId, g1.id))
        .where(and(eq(hv.id, w.handwerkervertragId), eq(g1.mandantId, mandantId)));
      if (!x) throw new BadRequestException("Handwerkervertrag nicht gefunden");
    }
    if (w.kaufvertragId) {
      const [x] = await this.db
        .select({ id: kv.id })
        .from(kv)
        .innerJoin(p2, eq(kv.projektId, p2.id))
        .innerJoin(g2, eq(p2.gesellschaftId, g2.id))
        .where(and(eq(kv.id, w.kaufvertragId), eq(g2.mandantId, mandantId)));
      if (!x) throw new BadRequestException("Kaufvertrag nicht gefunden");
    }
    if (w.buergeId) {
      const [x] = await this.db.select({ id: gp.id }).from(gp).where(and(eq(gp.id, w.buergeId), eq(gp.mandantId, mandantId)));
      if (!x) throw new BadRequestException("Bürge nicht gefunden");
    }
  }

  private werte(w: Werte) {
    return {
      ...w,
      betrag: w.betrag!,
      handwerkervertragId: w.richtung === "erhalten" ? w.handwerkervertragId! : null,
      kaufvertragId: w.richtung === "ausgegeben" ? w.kaufvertragId! : null,
    };
  }

  @Get()
  async liste(
    @Query("projektId") projektId?: string,
    @Query("handwerkervertragId") handwerkervertragId?: string,
    @Query("kaufvertragId") kaufvertragId?: string,
    @Query("richtung") richtung?: string,
    @Query("status") status?: string,
  ) {
    let liste = await this.abfrage({ projektId: uuid(projektId), handwerkervertragId: uuid(handwerkervertragId), kaufvertragId: uuid(kaufvertragId), richtung });
    if (status === "offen") liste = liste.filter((x) => x.status !== "zurueckgegeben");
    else if (status === "handlung") liste = liste.filter((x) => ["abgelaufen", "rueckgabe_faellig", "laeuft_ab"].includes(x.status));
    const aktiv = liste.filter((x) => x.status !== "zurueckgegeben");
    const s = (r: string) => summe(aktiv.filter((x) => x.richtung === r).map((x) => money(x.betrag))).toFixed(2);
    return { buergschaften: liste, summen: { erhalten: s("erhalten"), ausgegeben: s("ausgegeben"), handlungsbedarf: liste.filter((x) => ["abgelaufen", "rueckgabe_faellig", "laeuft_ab"].includes(x.status)).length } };
  }

  @Get(":id")
  async eine(@Param("id", ParseUUIDPipe) id: string) {
    const [x] = await this.abfrage({ id });
    if (!x) throw new NotFoundException("Bürgschaft nicht gefunden");
    return x;
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(BuergschaftEingabe, body);
    await this.pruefeBezug(w);
    return this.db.transaction(async (tx) => {
      const werte = this.werte(w);
      const [neu] = await tx.insert(b).values(werte).returning();
      await protokollieren(tx, { tabelle: "buergschaft", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(BuergschaftEingabe, body);
    const vorher = await this.eine(id);
    await this.pruefeBezug(w);
    const [alt] = await this.db.select().from(b).where(eq(b.id, vorher.id));
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(b).set({ ...this.werte(w), geaendertAm: new Date() }).where(eq(b.id, id)).returning();
      const d = differenz(alt!, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "buergschaft", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  @Delete(":id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    await this.eine(id);
    const [alt] = await this.db.select().from(b).where(eq(b.id, id));
    await this.db.transaction(async (tx) => {
      await tx.delete(b).where(eq(b.id, id));
      await protokollieren(tx, { tabelle: "buergschaft", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }
}
