"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

const daten = (fd: FormData) => formularDaten(fd, { listen: ["rollen"] });

export async function partnerAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/partner", { method: "POST", body: daten(fd) })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/partner");
  redirect(`/partner/${id}`);
}

export async function partnerAendern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/partner/${id}`, { method: "PUT", body: daten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/partner");
  return { meldung: "Gespeichert." };
}
