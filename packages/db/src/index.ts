import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * as schema from "./schema.js";

export function verbinden(url = process.env.DATABASE_URL ?? "postgres://bt:bt@localhost:5432/bautraeger") {
  const client = postgres(url);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof verbinden>;
