import { Controller, Get, Inject, NotFoundException, Param, ParseIntPipe } from "@nestjs/common";
import { schema } from "@bt/db";
import { asc, eq } from "drizzle-orm";
import { DB, type Db } from "../db.provider.js";

@Controller("projekte")
export class ProjekteController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  liste() {
    return this.db.select().from(schema.projekt).orderBy(asc(schema.projekt.nr));
  }

  @Get(":nr")
  async eins(@Param("nr", ParseIntPipe) nr: number) {
    const [p] = await this.db.select().from(schema.projekt).where(eq(schema.projekt.nr, nr));
    if (!p) throw new NotFoundException(`Projekt ${nr} nicht gefunden`);
    const einheiten = await this.db
      .select()
      .from(schema.einheit)
      .where(eq(schema.einheit.projektId, p.id))
      .orderBy(asc(schema.einheit.nr));
    return { ...p, einheiten };
  }
}
