"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function kontierungSpeichern(gesellschaftId: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/buchhaltung/kontierung/${gesellschaftId}`, { method: "PUT", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/buchhaltung");
  return { meldung: "Kontenzuordnung gespeichert – noch nicht exportierte Buchungen wurden angepasst, exportierte werden storniert und neu gebucht." };
}

export async function kontierungZuruecksetzen(gesellschaftId: string): Promise<AktionsErgebnis> {
  try {
    await api(`/buchhaltung/kontierung/${gesellschaftId}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/buchhaltung");
  return { meldung: "Standardkonten des Kontenrahmens wiederhergestellt." };
}
