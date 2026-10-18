"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function anmeldungSpeichern(fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api("/bauabzug/anmeldungen", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/bauabzug");
  return { meldung: "Gespeichert." };
}

export async function anmeldungZuruecknehmen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/bauabzug/anmeldungen/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/bauabzug");
  return {};
}
