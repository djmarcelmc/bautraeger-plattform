"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";

export async function hochladen(fd: FormData): Promise<AktionsErgebnis> {
  const dateien = fd.getAll("dateien").filter((d): d is File => d instanceof File && d.size > 0);
  if (!dateien.length) return { fehler: ["Bitte mindestens eine Rechnung auswählen."] };
  const ziel = new FormData();
  for (const d of dateien) ziel.append("dateien", d, d.name);
  try {
    const r = await api<{ angelegt: string[]; ignoriert: number }>("/rechnungseingang", { method: "POST", body: ziel });
    revalidatePath("/rechnungseingang");
    return { meldung: `${r.angelegt.length} ${r.angelegt.length === 1 ? "Rechnung" : "Rechnungen"} aufgenommen${r.ignoriert ? `, ${r.ignoriert} andere Datei(en) übersprungen` : ""}.` };
  } catch (e) {
    return alsErgebnis(e);
  }
}

export async function abrufen(): Promise<AktionsErgebnis> {
  try {
    const r = await api<{ mails: number; neu: number; ohneBeleg: number }>("/rechnungseingang/abrufen", { method: "POST" });
    revalidatePath("/rechnungseingang");
    return { meldung: r.mails ? `${r.mails} neue Mail(s), ${r.neu} Rechnung(en) aufgenommen${r.ohneBeleg ? `, ${r.ohneBeleg} ohne Rechnungsanhang` : ""}.` : "Keine neuen Mails im Rechnungspostfach." };
  } catch (e) {
    return alsErgebnis(e);
  }
}

export async function erfassen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  let rechnungId: string;
  try {
    const r = await api<{ eingangsrechnungId: string }>(`/rechnungseingang/${id}/erfassen`, {
      method: "POST",
      body: {
        handwerkervertragId: fd.get("handwerkervertragId"),
        rechnungsnr: fd.get("rechnungsnr"),
        rechnungsdatum: fd.get("rechnungsdatum"),
        eingangAm: fd.get("eingangAm"),
        betragBrutto: fd.get("betragBrutto"),
        schlussrechnung: fd.get("schlussrechnung") === "on",
      },
    });
    rechnungId = r.eingangsrechnungId;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/rechnungseingang");
  redirect(`/eingangsrechnungen/${rechnungId}`);
}

export async function verwerfen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/rechnungseingang/${id}/verwerfen`, { method: "POST", body: { bemerkung: fd.get("bemerkung") ?? "" } });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/rechnungseingang");
  redirect("/rechnungseingang");
}

export async function wiederherstellen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/rechnungseingang/${id}/wiederherstellen`, { method: "POST" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/rechnungseingang");
  return {};
}
