"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

async function ausfuehren(projektId: string, fn: () => Promise<unknown>, meldung?: string): Promise<AktionsErgebnis> {
  try {
    await fn();
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  return meldung ? { meldung } : {};
}

const daten = (fd: FormData) => formularDaten(fd, { listen: ["gewerkIds", "vorgaengerIds"] });

export async function bauzeitenplanAnlegen(projektId: string, fd: FormData) {
  return ausfuehren(projektId, () => api(`/projekte/${projektId}/bauzeitenplan`, { method: "POST", body: formularDaten(fd) }), "Bauzeitenplan angelegt.");
}

export async function bauzeitenplanVerschieben(projektId: string, fd: FormData) {
  let n = 0;
  const r = await ausfuehren(projektId, async () => {
    n = (await api<{ verschoben: number }>(`/projekte/${projektId}/bauzeitenplan/verschieben`, { method: "POST", body: formularDaten(fd) })).verschoben;
  });
  return r.fehler ? r : { meldung: `${n} Vorgänge verschoben.` };
}

export async function vorgangAnlegen(projektId: string, fd: FormData) {
  return ausfuehren(projektId, () => api(`/projekte/${projektId}/vorgaenge`, { method: "POST", body: daten(fd) }), "Vorgang angelegt.");
}

export async function vorgangAendern(projektId: string, id: string, fd: FormData) {
  let verschoben: { bezeichnung: string; tage: number }[] = [];
  const r = await ausfuehren(projektId, async () => {
    verschoben = (await api<{ nachfolgerVerschoben: { bezeichnung: string; tage: number }[] }>(`/vorgaenge/${id}`, { method: "PUT", body: daten(fd) })).nachfolgerVerschoben;
  });
  if (r.fehler) return r;
  if (!verschoben.length) return { meldung: "Gespeichert." };
  const liste = verschoben.map((v) => `${v.bezeichnung} (+${v.tage} T.)`).join(", ");
  return { meldung: `Gespeichert. ${verschoben.length} ${verschoben.length === 1 ? "Nachfolger" : "Nachfolger"} mitverschoben: ${liste}` };
}

export async function vorgangLoeschen(projektId: string, id: string) {
  return ausfuehren(projektId, () => api(`/vorgaenge/${id}`, { method: "DELETE" }));
}
