import { schema, type DbOderTx } from "@bt/db";

/** Schreibt einen Eintrag ins GoBD-Änderungsprotokoll (alt → neu). */
export async function protokollieren(
  tx: DbOderTx,
  e: { tabelle: string; id: string; aktion: "insert" | "update" | "delete"; alt?: unknown; neu?: unknown; benutzer: string },
) {
  await tx.insert(schema.aenderungsprotokoll).values({
    tabelle: e.tabelle,
    datensatzId: e.id,
    aktion: e.aktion,
    alt: e.alt ?? null,
    neu: e.neu ?? null,
    benutzer: e.benutzer,
  });
}

/** Nur die geänderten Felder für das Protokoll (ohne Zeitstempel). */
export function differenz(alt: Record<string, unknown>, neu: Record<string, unknown>) {
  const a: Record<string, unknown> = {};
  const n: Record<string, unknown> = {};
  for (const k of Object.keys(neu)) {
    if (k === "geaendertAm" || k === "angelegtAm") continue;
    if (JSON.stringify(alt[k]) !== JSON.stringify(neu[k])) {
      a[k] = alt[k];
      n[k] = neu[k];
    }
  }
  return { alt: a, neu: n, geaendert: Object.keys(n).length > 0 };
}
