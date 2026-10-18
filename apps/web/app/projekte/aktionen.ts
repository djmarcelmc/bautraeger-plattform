"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

const daten = (fd: FormData) => formularDaten(fd, { haken: ["para13bAnwendbar", "abgeschlossen"] });

export async function projektAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/projekte", { method: "POST", body: daten(fd) })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/projekte");
  redirect(`/projekte/${id}`);
}

export async function projektAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/projekte/${id}`, { method: "PUT", body: daten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${id}`);
  return { meldung: "Gespeichert." };
}

export async function projektKopieren(id: string, fd: FormData): Promise<AktionsErgebnis> {
  let neu: string;
  try {
    const body = formularDaten(fd, { haken: ["einheitenKopieren", "gewerkeKopieren"] });
    neu = (await api<{ id: string }>(`/projekte/${id}/kopieren`, { method: "POST", body })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/projekte");
  redirect(`/projekte/${neu}`);
}

export async function einheitAnlegen(projektId: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/projekte/${projektId}/einheiten`, { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  return { meldung: "Einheit angelegt." };
}
