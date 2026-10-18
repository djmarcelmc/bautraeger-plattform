import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export * as schema from "./schema.js";

const STANDARD_URL = "postgres://bt:bt@localhost:5432/bautraeger";

export function verbinden(url = process.env.DATABASE_URL ?? STANDARD_URL) {
  const client = postgres(url, { onnotice: () => {} });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof verbinden>;
/** Transaktion oder Datenbank – beides kann Abfragen ausführen. */
export type DbOderTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Wendet alle Migrationen aus packages/db/migrations an. */
export async function migrieren(url = process.env.DATABASE_URL ?? STANDARD_URL) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  } finally {
    await client.end();
  }
}
