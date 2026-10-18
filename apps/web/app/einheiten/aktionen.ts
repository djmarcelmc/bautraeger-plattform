"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function einheitAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/einheiten/${id}`, { method: "PUT", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/einheiten/${id}`);
  return { meldung: "Gespeichert." };
}

export async function einheitLoeschen(id: string, projektId: string): Promise<AktionsErgebnis> {
  try {
    await api(`/einheiten/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  redirect(`/projekte/${projektId}`);
}
