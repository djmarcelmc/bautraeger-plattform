"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

async function ausfuehren(aufruf: () => Promise<unknown>, pfad: string, meldung?: string): Promise<AktionsErgebnis> {
  try {
    await aufruf();
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad);
  revalidatePath("/sonderwuensche");
  return meldung ? { meldung } : {};
}

export async function sonderwunschAnlegen(kaufvertragId: string, pfad: string, fd: FormData) {
  return ausfuehren(() => api(`/kaufvertraege/${kaufvertragId}/sonderwuensche`, { method: "POST", body: formularDaten(fd) }), pfad, "Angebot angelegt.");
}

export async function sonderwunschAendern(id: string, pfad: string, fd: FormData) {
  return ausfuehren(() => api(`/sonderwuensche/${id}`, { method: "PUT", body: formularDaten(fd) }), pfad, "Gespeichert.");
}

export async function sonderwunschEntscheiden(id: string, pfad: string, fd: FormData) {
  const entscheidung = fd.get("entscheidung") === "ablehnen" ? "ablehnen" : "beauftragen";
  return ausfuehren(() => api(`/sonderwuensche/${id}/${entscheidung}`, { method: "POST", body: { datum: fd.get("datum") } }), pfad);
}

export async function sonderwunschZuruecksetzen(id: string, pfad: string) {
  return ausfuehren(() => api(`/sonderwuensche/${id}/zuruecksetzen`, { method: "POST" }), pfad);
}

export async function sonderwunschLoeschen(id: string, pfad: string) {
  return ausfuehren(() => api(`/sonderwuensche/${id}`, { method: "DELETE" }), pfad);
}
