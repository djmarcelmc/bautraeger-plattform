"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function briefbogenHochladen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  const datei = fd.get("datei");
  if (!(datei instanceof File) || !datei.size) return { fehler: ["Bitte eine PDF-Datei auswählen."] };
  const ziel = new FormData();
  ziel.set("datei", datei, datei.name);
  try {
    await api(`/gesellschaften/${id}/briefbogen`, { method: "POST", body: ziel });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/gesellschaften/${id}`);
  return { meldung: "Briefbogen hinterlegt – alle Schreiben dieser Gesellschaft verwenden ihn ab sofort." };
}

export async function briefbogenEinstellen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/gesellschaften/${id}/briefbogen`, { method: "PUT", body: { ...formularDaten(fd), absenderzeileAusblenden: fd.get("absenderzeileAusblenden") === "on" } });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/gesellschaften/${id}`);
  return { meldung: "Satzspiegel gespeichert." };
}

export async function briefbogenEntfernen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/gesellschaften/${id}/briefbogen`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/gesellschaften/${id}`);
  return {};
}
