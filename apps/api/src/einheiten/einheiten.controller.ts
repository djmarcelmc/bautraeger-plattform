import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { schema } from "@bt/db";
import { EinheitEingabe } from "@bt/domain";
import { and, eq } from "drizzle-orm";
import { Benutzer, pruefe } from "../common/eingabe.js";
import { KontextService } from "../common/kontext.service.js";
import { differenz, protokollieren } from "../common/protokoll.js";
import { DB, type Db } from "../db.provider.js";

const e = schema.einheit;
const p = schema.projekt;
const g = schema.gesellschaft;

@Controller()
export class EinheitenController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KontextService) private readonly kontext: KontextService,
  ) {}

  private async projektPruefen(projektId: string) {
    const [x] = await this.db
      .select({ id: p.id })
      .from(p)
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(p.id, projektId), eq(g.mandantId, await this.kontext.mandantId())));
    if (!x) throw new NotFoundException("Projekt nicht gefunden");
  }

  private async zugehoerigePruefen(projektId: string, einheitId: string | null | undefined) {
    if (!einheitId) return;
    const [x] = await this.db.select({ id: e.id }).from(e).where(and(eq(e.id, einheitId), eq(e.projektId, projektId)));
    if (!x) throw new NotFoundException("Zugehörige Einheit gehört nicht zu diesem Projekt");
  }

  @Get("einheiten/:id")
  async eine(@Param("id", ParseUUIDPipe) id: string) {
    const [r] = await this.db
      .select({ einheit: e, projekt: { id: p.id, nr: p.nr, suchcode: p.suchcode } })
      .from(e)
      .innerJoin(p, eq(e.projektId, p.id))
      .innerJoin(g, eq(p.gesellschaftId, g.id))
      .where(and(eq(e.id, id), eq(g.mandantId, await this.kontext.mandantId())));
    if (!r) throw new NotFoundException("Einheit nicht gefunden");
    return { ...r.einheit, projekt: r.projekt };
  }

  @Post("projekte/:projektId/einheiten")
  async anlegen(@Param("projektId", ParseUUIDPipe) projektId: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(EinheitEingabe, body);
    await this.projektPruefen(projektId);
    await this.zugehoerigePruefen(projektId, werte.zugehoerigZuEinheitId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.insert(e).values({ ...werte, projektId }).returning();
      await protokollieren(tx, { tabelle: "einheit", id: neu!.id, aktion: "insert", neu: werte, benutzer });
      return neu;
    });
  }

  @Put("einheiten/:id")
  async aendern(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Benutzer() benutzer: string) {
    const werte = pruefe(EinheitEingabe, body);
    const { projekt, ...alt } = await this.eine(id);
    if (werte.zugehoerigZuEinheitId === id) throw new NotFoundException("Eine Einheit kann nicht sich selbst zugeordnet sein");
    await this.zugehoerigePruefen(projekt.id, werte.zugehoerigZuEinheitId);
    return this.db.transaction(async (tx) => {
      const [neu] = await tx.update(e).set({ ...werte, geaendertAm: new Date() }).where(eq(e.id, id)).returning();
      const d = differenz(alt, neu!);
      if (d.geaendert) await protokollieren(tx, { tabelle: "einheit", id, aktion: "update", ...d, benutzer });
      return neu;
    });
  }

  /** Löschen ist nur möglich, solange die Einheit in keinem Kaufvertrag steht (sonst 409). */
  @Delete("einheiten/:id")
  async loeschen(@Param("id", ParseUUIDPipe) id: string, @Benutzer() benutzer: string) {
    const { projekt: _p, ...alt } = await this.eine(id);
    void _p;
    await this.db.transaction(async (tx) => {
      await tx.update(e).set({ zugehoerigZuEinheitId: null }).where(eq(e.zugehoerigZuEinheitId, id));
      await tx.delete(e).where(eq(e.id, id));
      await protokollieren(tx, { tabelle: "einheit", id, aktion: "delete", alt, benutzer });
    });
    return { geloescht: true };
  }
}
