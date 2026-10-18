import { verbinden, type Db } from "@bt/db";

export const DB = Symbol("DB");
export type { Db };

export const dbProvider = { provide: DB, useFactory: (): Db => verbinden() };
