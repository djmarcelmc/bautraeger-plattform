"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

export async function zahlungslaufAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/zahlungslaeufe", { method: "POST", body: formularDaten(fd, { listen: ["rechnungIds", "ibanBestaetigt"] }) })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/zahlungslaeufe");
  revalidatePath("/kosten");
  redirect(`/zahlungslaeufe/${id}`);
}
