import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { schema } from "@bt/db";
import { PARTNER_ROLLEN, PartnerEingabe } from "@bt/domain";
import { and, arrayContains, asc, eq, ilike, max, or, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const t = schema.geschaeftspartner;
type Rolle = (typeof PARTNER_ROLLEN)[number];

@Controller("partner")
export class PartnerController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  @Get()
  async liste(@Query("suche") suche?: string, @Query("rolle") rolle?: string) {
    const mandantId = await this.kontext.mandantId();
    const muster = suche ? `%${suche.trim()}%` : undefined;
    return this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.mandantId, mandantId),
          muster
            ? or(ilike(t.suchcode, muster), ilike(t.firma, muster), ilike(t.nachname, muster), ilike(t.ort, muster), sql`${t.nr}::text like ${muster}`)
            : undefined,
          rolle && (PARTNER_ROLLEN as readonly string[]).includes(rolle) ? arrayContains(t.rollen, [rolle as Rolle]) : undefined,
        ),
      )
      .orderBy(asc(t.suchcode))
      .limit(500);
  }

  /** Vorschlag für die nächste freie Nummer. */
  @Get("naechste-nr")
  async naechsteNr() {
    const [r] = await this.db.select({ m: max(t.nr) }).from(t).where(eq(t.mandantId, await this.kontext.mandantId()));
    return { nr: (r?.m ?? 10000) + 1 };
  }

  @Get(":id")
  async einer(@Param("id", ParseUUIDPipe) id: string) {
    const [p] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.mandantId, await this.kontext.mandantId())));
    if (!p) throw new NotFoundException("Geschäftspartner nicht gefunden");
    return p;
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(PartnerEingabe, body);
    const mandantId = await this.kontext.mandantId();
    return this.db.transaction(async (tx) => {
      const [p] = await tx.insert(t).values({ ...werte, mandantId }).returning();
      await protokollieren(tx, { tabelle: "geschaeftspartner", id: p!.id, aktion: "insert", neu: werte, benutzer });
      return p;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(PartnerEingabe, body);
    const alt = await this.einer(id);
    return this.db.transaction(async (tx) => {
      const [p] = await tx.update(t).set({ ...werte, geaendertAm: new Date() }).where(eq(t.id, id)).returning();
      const d = differenz(alt, p!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "geschaeftspartner", id, aktion: "update", ...d, benutzer });
      return p;
    });
  }
}
