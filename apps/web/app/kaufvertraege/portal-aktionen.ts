"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

/** Erzeugt einen neuen Portal-Link; der Token wird nur jetzt angezeigt. */
export async function portalLinkErzeugen(id: string, fd: FormData): Promise<AktionsErgebnis & { link?: string; gueltigBis?: string }> {
  let r: { token: string; gueltigBis: string };
  try {
    r = await api(`/kaufvertraege/${id}/portal`, { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  const h = await headers();
  const basis = process.env.PUBLIC_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  revalidatePath(`/kaufvertraege/${id}`);
  return { link: `${basis.replace(/\/$/, "")}/portal/${r.token}`, gueltigBis: r.gueltigBis };
}

export async function portalLinkWiderrufen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/kaufvertraege/${id}/portal`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/kaufvertraege/${id}`);
  return { meldung: "Link widerrufen – er funktioniert ab sofort nicht mehr." };
}
