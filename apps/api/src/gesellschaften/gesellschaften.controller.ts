import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { schema } from "@bt/db";
import { GesellschaftEingabe } from "@bt/domain";
import { and, asc, eq } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const t = schema.gesellschaft;

@Controller("gesellschaften")
export class GesellschaftenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  @Get()
  async liste() {
    return this.db.select().from(t).where(eq(t.mandantId, await this.kontext.mandantId())).orderBy(asc(t.nr));
  }

  @Get(":id")
  async eine(@Param("id", ParseUUIDPipe) id: string) {
    const [g] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.mandantId, await this.kontext.mandantId())));
    if (!g) throw new NotFoundException("Gesellschaft nicht gefunden");
    return g;
  }

  @Post()
  async anlegen(@Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(GesellschaftEingabe, body);
    const mandantId = await this.kontext.mandantId();
    return this.db.transaction(async (tx) => {
      const [g] = await tx.insert(t).values({ ...werte, mandantId }).returning();
      await protokollieren(tx, { tabelle: "gesellschaft", id: g!.id, aktion: "insert", neu: werte, benutzer });
      return g;
    });
  }

  @Put(":id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(GesellschaftEingabe, body);
    const alt = await this.eine(id);
    return this.db.transaction(async (tx) => {
      const [g] = await tx.update(t).set({ ...werte, geaendertAm: new Date() }).where(eq(t.id, id)).returning();
      const d = differenz(alt, g!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "gesellschaft", id, aktion: "update", ...d, benutzer });
      return g;
    });
  }
}
