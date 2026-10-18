"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

const daten = (fd: FormData) => formularDaten(fd, { haken: ["einbehalt"] });

/** Fotos/Dateien aus dem Formular an einen Mangel hängen. */
async function fotosHochladen(mangelId: string, fd: FormData) {
  const dateien = fd.getAll("fotos").filter((d): d is File => d instanceof File && d.size > 0);
  for (const datei of dateien) {
    const ziel = new FormData();
    ziel.set("objektTyp", "mangel");
    ziel.set("objektId", mangelId);
    ziel.set("datei", datei, datei.name);
    await api("/dokumente", { method: "POST", body: ziel });
  }
  return dateien.length;
}

export async function mangelAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/maengel", { method: "POST", body: daten(fd) })).id;
    await fotosHochladen(id, fd);
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/maengel");
  redirect(`/maengel/${id}`);
}

export async function mangelAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/maengel/${id}`, { method: "PUT", body: daten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/maengel/${id}`);
  return { meldung: "Gespeichert." };
}

export async function fotosAnhaengen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  let n: number;
  try {
    n = await fotosHochladen(id, fd);
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/maengel/${id}`);
  return n ? { meldung: `${n} Foto(s) hinzugefügt.` } : { fehler: ["Bitte ein Foto auswählen."] };
}

export async function ruegen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/maengel/${id}/ruegen`, { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/maengel/${id}`);
  return { meldung: "Rüge erfasst – Schreiben über „Drucken“ erstellen." };
}

export async function erledigen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/maengel/${id}/erledigt`, { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/maengel/${id}`);
  revalidatePath("/maengel");
  return { meldung: "Als erledigt markiert." };
}

export async function wiedereroeffnen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/maengel/${id}/wiedereroeffnen`, { method: "POST" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/maengel/${id}`);
  revalidatePath("/maengel");
  return {};
}
