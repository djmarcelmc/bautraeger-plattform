"use server";

import type { ImportPruefung } from "@bt/domain";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";

export type PruefErgebnis = AktionsErgebnis & { pruefung?: ImportPruefung };

function weiterleiten(fd: FormData): { art: string; ziel: FormData } | { fehler: string[] } {
  const art = String(fd.get("art") ?? "");
  const datei = fd.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: ["Bitte eine Datei auswählen."] };
  const ziel = new FormData();
  ziel.set("datei", datei, datei.name);
  const projektId = fd.get("projektId");
  if (art === "einheiten" && typeof projektId === "string" && projektId) ziel.set("projektId", projektId);
  if (fd.get("aktualisieren")) ziel.set("aktualisieren", "true");
  return { art, ziel };
}

export async function importPruefen(fd: FormData): Promise<PruefErgebnis> {
  const w = weiterleiten(fd);
  if ("fehler" in w) return w;
  try {
    return { pruefung: await api<ImportPruefung>(`/import/${w.art}/pruefen`, { method: "POST", body: w.ziel }) };
  } catch (e) {
    return alsErgebnis(e);
  }
}

export async function importAusfuehren(fd: FormData): Promise<AktionsErgebnis> {
  const w = weiterleiten(fd);
  if ("fehler" in w) return w;
  try {
    const r = await api<{ angelegt: number; aktualisiert: number; unveraendert: number }>(`/import/${w.art}/ausfuehren`, { method: "POST", body: w.ziel });
    revalidatePath(w.art === "partner" ? "/partner" : "/projekte");
    const teile = [`${r.angelegt} angelegt`, r.aktualisiert ? `${r.aktualisiert} aktualisiert` : "", r.unveraendert ? `${r.unveraendert} unverändert` : ""].filter(Boolean);
    return { meldung: `Import abgeschlossen: ${teile.join(", ")}.` };
  } catch (e) {
    return alsErgebnis(e);
  }
}
