"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";

export async function dokumentHochladen(objektTyp: string, objektId: string, pfad: string, fd: FormData): Promise<AktionsErgebnis> {
  const dateien = fd.getAll("datei").filter((d): d is File => d instanceof File && d.size > 0);
  if (!dateien.length) return { fehler: ["Bitte eine Datei auswählen."] };
  try {
    for (const datei of dateien) {
      const ziel = new FormData();
      ziel.set("objektTyp", objektTyp);
      ziel.set("objektId", objektId);
      const beschreibung = fd.get("beschreibung");
      if (typeof beschreibung === "string" && beschreibung) ziel.set("beschreibung", beschreibung);
      ziel.set("datei", datei, datei.name);
      await api("/dokumente", { method: "POST", body: ziel });
    }
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad);
  return { meldung: dateien.length === 1 ? "Dokument hochgeladen." : `${dateien.length} Dokumente hochgeladen.` };
}

export async function dokumentAusblenden(id: string, pfad: string): Promise<AktionsErgebnis> {
  try {
    await api(`/dokumente/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad);
  return {};
}
