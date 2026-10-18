"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function buergschaftAnlegen(pfad: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api("/buergschaften", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad);
  revalidatePath("/buergschaften");
  return { meldung: "Bürgschaft erfasst." };
}

export async function buergschaftAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/buergschaften/${id}`, { method: "PUT", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/buergschaften/${id}`);
  revalidatePath("/buergschaften");
  return { meldung: "Gespeichert." };
}

export async function buergschaftLoeschen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/buergschaften/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/buergschaften");
  redirect("/buergschaften");
}
