import { Controller, Get, Inject, Param, ParseUUIDPipe } from "@nestjs/common";
import { schema } from "@bt/db";
import { desc, eq } from "drizzle-orm";
import { DB, type Db } from "../db.provider.js";

const a = schema.aenderungsprotokoll;

@Controller("protokoll")
export class ProtokollController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Änderungshistorie eines Datensatzes, neueste zuerst. */
  @Get(":datensatzId")
  historie(@Param("datensatzId", ParseUUIDPipe) datensatzId: string) {
    return this.db.select().from(a).where(eq(a.datensatzId, datensatzId)).orderBy(desc(a.zeitpunkt)).limit(200);
  }
}
