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
  let ibanGeaendert = false;
  try {
    const vorher = await api<{ iban: string | null }>(`/partner/${id}`);
    const nachher = await api<{ iban: string | null }>(`/partner/${id}`, { method: "PUT", body: daten(fd) });
    ibanGeaendert = (vorher.iban ?? "") !== (nachher.iban ?? "") && !!nachher.iban;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/partner");
  revalidatePath(`/partner/${id}`);
  return { meldung: ibanGeaendert ? "Gespeichert. Die IBAN wurde geändert – bitte den Rückruf beim Handwerker unter der bekannten Telefonnummer dokumentieren (unten bei „Bankverbindung“)." : "Gespeichert." };
}

/** Rückruf zur Bestätigung der aktuellen IBAN dokumentieren. */
export async function rueckrufDokumentieren(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/partner/${id}/iban/rueckruf`, { method: "POST", body: { rueckrufAm: fd.get("rueckrufAm"), gespraechspartner: fd.get("gespraechspartner"), telefon: fd.get("telefon") ?? "", bemerkung: fd.get("bemerkung") ?? "" } });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/partner/${id}`);
  return { meldung: "Rückruf dokumentiert – die Bankverbindung gilt im Zahlungslauf als bestätigt." };
}
