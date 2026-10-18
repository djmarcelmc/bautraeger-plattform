"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";
import { seiteAlsPdf } from "@/lib/pdf";

/** Erzeugt das Schreiben als PDF und stellt es mit Begleittext in den Postausgang. */
export async function schreibenVersenden(art: "zahlungsanforderung" | "mahnung" | "sonderwunsch", id: string, pfad: string, fd: FormData): Promise<AktionsErgebnis> {
  let pdf: Buffer;
  try {
    pdf = await seiteAlsPdf(pfad);
  } catch (e) {
    return { fehler: [`PDF konnte nicht erzeugt werden: ${(e as Error).message}`] };
  }
  const ziel = new FormData();
  for (const k of ["an", "betreff", "text"]) ziel.set(k, String(fd.get(k) ?? ""));
  ziel.set("datei", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "schreiben.pdf");
  let r: { dateiname: string };
  try {
    r = await api<{ dateiname: string }>(`/schreiben/${art}/${id}/versenden`, { method: "POST", body: ziel });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad.split("?")[0]!);
  return { meldung: `${r.dateiname} wurde in den Postausgang gestellt und am Kaufvertrag abgelegt.` };
}
