import { Inject, Injectable } from "@nestjs/common";
import { schema } from "@bt/db";
import { asc } from "drizzle-orm";
import { DB, type Db } from "../db.provider.js";

/**
 * Mandantenkontext. Übergangsweise: der erste Mandant der Datenbank (wird bei Bedarf angelegt).
 * Mit der Entra-Anmeldung wird der Mandant aus dem Benutzerkonto bestimmt.
 */
@Injectable()
export class KontextService {
  private mandant?: Promise<string>;

  constructor(@Inject(DB) private readonly db: Db) {}

  mandantId(): Promise<string> {
    this.mandant ??= (async () => {
      const [m] = await this.db.select().from(schema.mandant).orderBy(asc(schema.mandant.angelegtAm)).limit(1);
      if (m) return m.id;
      const [neu] = await this.db.insert(schema.mandant).values({ name: "Standard" }).returning();
      return neu!.id;
    })();
    return this.mandant;
  }
}
