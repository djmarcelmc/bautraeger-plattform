import { Body, ConflictException, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { schema } from "@bt/db";
import { MangelvorlageEingabe, STANDARD_MAENGEL } from "@bt/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const { mangelvorlage: mv } = schema;

@Controller("mangelvorlagen")
export class MangelvorlagenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  @Get()
  async liste() {
    return this.db.select().from(mv).where(eq(mv.mandantId, await this.kontext.mandantId())).orderBy(asc(mv.kategorie), asc(mv.titel));
  }

  /** Übernimmt den Startkatalog (nur, solange noch keine Vorlagen vorhanden sind). */
  @Post("standard")
  async standard(@Benutzer() benutzer: string) {
    const mandantId = await this.kontext.mandantId();
    const [x] = await this.db.select({ n: sql<number>`count(*)::int` }).from(mv).where(eq(mv.mandantId, mandantId));
    if (x!.n > 0) throw new ConflictException("Es sind bereits Mängelvorlagen vorhanden.");
    await this.db.transaction(async (tx) => {
      await tx.insert(mv).values(STANDARD_MAENGEL.map((m) => ({ ...m, mandantId })));
      await protokollieren(tx, { tabelle: "mangelvorlage", id: mandantId, aktion: "insert", neu: { standardkatalog: STANDARD_MAENGEL.length }, benutzer });
    });
    return { angelegt: STANDARD_MAENGEL.length };
  }

  private async eine(id: string) {
    const [x] = await this.db.select().from(mv).where(and(eq(mv.id, id), eq(mv.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Vorlage nicht gefunden");
    return x;
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(MangelvorlageEingabe, body);
    const mandantId = await this.kontext.mandantId();
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.insert(mv).values({ ...w, mandantId }).returning();
      await protokollieren(tx, { tabelle: "mangelvorlage", id: neu!.id, aktion: "insert", neu: w, benutzer });
      return neu;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const w = pruefe(MangelvorlageEingabe, body);
    const alt = await this.eine(id);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(mv).set({ ...w, geaendertAm: new Date() }).where(eq(mv.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "mangelvorlage", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  @Delete(":id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const alt = await this.eine(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(mv).where(eq(mv.id, id));
      await protokollieren(tx, { tabelle: "mangelvorlage", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }
}
