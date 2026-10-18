"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function gesellschaftAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api("/gesellschaften", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/gesellschaften");
  return { meldung: "Gesellschaft angelegt." };
}

export async function gesellschaftAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/gesellschaften/${id}`, { method: "PUT", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/gesellschaften");
  return { meldung: "Gespeichert." };
}
