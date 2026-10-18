import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { KaufvertragEingabe, KaufvertragKonditionen, STANDARD_7_RATEN, money, ratenplanBerechnen, summe } from "@bt/domain";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";
import { VerkaufService } from "./verkauf.service.js";

const { kaufvertrag: k, projekt: p, gesellschaft: g } = schema;

@Controller("kaufvertraege")
export class KaufvertraegeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
    @Inject(VerkaufService) private readonly verkauf: VerkaufService,
  ) {}

  /** Übersicht mit Käufern, Einheiten und Zahlungsstand. */
  @Get()
  async liste(@Query("projektId") projektId?: string, @Query("suche") suche?: string) {
    const mandantId = await this.kontext.mandantId();
    const muster = suche ? `%${suche.trim()}%` : undefined;
    const kaeuferText = sql<string>`(select string_agg(coalesce(gp.firma, concat_ws(' ', gp.vorname, gp.nachname)), ', ')
      from ${schema.kaufvertragKaeufer} kk join ${schema.geschaeftspartner} gp on gp.id = kk.partner_id where kk.kaufvertrag_id = ${k.id})`;
    return this.db
      .select({
        id: k.id,
        nr: k.nr,
        datum: k.datum,
        urkundennr: k.urkundennr,
        projektId: p.id,
        projektNr: p.nr,
        projekt: p.suchcode,
        kaeufer: kaeuferText,
        einheiten: sql<string>`(select string_agg(e.nr, ', ' order by e.nr) from ${schema.kaufvertragEinheit} ke join ${schema.einheit} e on e.id = ke.einheit_id where ke.kaufvertrag_id = ${k.id})`,
        vertragssumme: sql<string>`(select coalesce(sum(vk_brutto), 0)::text from ${schema.kaufvertragEinheit} where kaufvertrag_id = ${k.id})`,
        angefordert: sql<string>`(select coalesce(sum(betrag), 0)::text from ${schema.zahlungsanforderung} where kaufvertrag_id = ${k.id})`,
        bezahlt: sql<string>`(select coalesce(sum(betrag), 0)::text from ${schema.zahlungseingang} where kaufvertrag_id = ${k.id})`,
      })
      .from(k)
      .innerJoin(p, eq(k.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(
        and(
          eq(g.mandantId, mandantId),
          projektId ? eq(p.id, projektId) : undefined,
          muster ? or(ilike(k.nr, muster), ilike(k.urkundennr, muster), sql`${kaeuferText} ilike ${muster}`) : undefined,
        ),
      )
      .orderBy(asc(p.nr), asc(k.nr));
  }

  @Get(":id")
  eins(@Param("id", ParseUUIDPipe) id: string) {
    return this.verkauf.vertrag(id);
  }

  /** Legt Vertrag, Käufer, Einheiten und den MaBV-Ratenplan in einem Schritt an. */
  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const v = pruefe(KaufvertragEingabe, body);
    const { projekt, gesellschaft } = await this.verkauf.projekt(v.projektId);

    const einheitIds = v.einheiten.map((e) => e.einheitId);
    const einheiten = await this.db.select().from(schema.einheit).where(inArray(schema.einheit.id, einheitIds));
    if (einheiten.length !== einheitIds.length || einheiten.some((e) => e.projektId !== projekt.id))
      throw new BadRequestException("Alle Einheiten müssen zum Projekt gehören");
    const partnerIds = [...new Set([...v.kaeufer.map((x) => x.partnerId), v.zahlungsanforderungAn])];
    const partner = await this.db
      .select({ id: schema.geschaeftspartner.id })
      .from(schema.geschaeftspartner)
      .where(and(inArray(schema.geschaeftspartner.id, partnerIds), eq(schema.geschaeftspartner.mandantId, gesellschaft.mandantId)));
    if (partner.length !== partnerIds.length) throw new BadRequestException("Unbekannter Geschäftspartner");

    const vertragssumme = summe(v.einheiten.map((e) => money(e.vkBrutto!)));
    const plan = ratenplanBerechnen(vertragssumme, v.raten ?? STANDARD_7_RATEN, { erbbaurecht: v.erbbaurecht });

    return this.db.transaction(async (tx) => {
      const [{ anzahl }] = (await tx
        .select({ anzahl: sql<number>`count(*)::int` })
        .from(k)
        .where(eq(k.projektId, projekt.id))) as [{ anzahl: number }];
      const nr = `KV-${projekt.nr}-${String(anzahl + 1).padStart(3, "0")}`;
      const { kaeufer, einheiten: ve, raten: _r, projektId, ...kopf } = v;
      void _r;
      const [neu] = await tx.insert(k).values({ ...kopf, projektId, nr }).returning();
      await tx.insert(schema.kaufvertragKaeufer).values(kaeufer.map((x) => ({ kaufvertragId: neu!.id, partnerId: x.partnerId, anteilProzent: x.anteilProzent ?? "100" })));
      await tx.insert(schema.kaufvertragEinheit).values(ve.map((x) => ({ kaufvertragId: neu!.id, einheitId: x.einheitId, vkBrutto: x.vkBrutto! })));
      await tx.insert(schema.rate).values(
        plan.map((r) => ({ kaufvertragId: neu!.id, nr: r.nr, typ: "mabv" as const, abschnitte: r.abschnitte, prozent: r.prozent.toFixed(4), betrag: r.betrag.toFixed(2), text: r.bezeichnung })),
      );
      // Käufer erhalten die Rolle „Kunde“
      await tx
        .update(schema.geschaeftspartner)
        .set({ rollen: sql`array(select distinct unnest(array_append(${schema.geschaeftspartner.rollen}, 'kunde')))` })
        .where(inArray(schema.geschaeftspartner.id, kaeufer.map((x) => x.partnerId)));
      await protokollieren(tx, {
        tabelle: "kaufvertrag",
        id: neu!.id,
        aktion: "insert",
        neu: { nr, vertragssumme: vertragssumme.toFixed(2), einheiten: einheiten.map((e) => e.nr), raten: plan.length },
        benutzer,
      });
      return neu;
    });
  }

  /** Konditionen und Fälligkeitsvoraussetzungen ändern (Preise/Einheiten bleiben fest). */
  @Put(":id/konditionen")
  async konditionen(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(KaufvertragKonditionen, body);
    const alt = await this.verkauf.vertrag(id);
    if (!alt.kaeufer.some((x) => x.id === werte.zahlungsanforderungAn))
      throw new ConflictException("Rechnungsempfänger muss einer der Käufer sein");
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(k).set({ ...werte, geaendertAm: new Date() }).where(eq(k.id, id)).returning();
      const d = differenz(alt as unknown as Record<string, unknown>, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "kaufvertrag", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }
}
