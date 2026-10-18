"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";

const fertig = (meldung?: string): AktionsErgebnis => {
  revalidatePath("/bankabgleich");
  return meldung ? { meldung } : {};
};

export async function auszugEinlesen(fd: FormData): Promise<AktionsErgebnis> {
  const datei = fd.get("datei");
  if (!(datei instanceof File) || !datei.size) return { fehler: ["Bitte eine Kontoauszugsdatei auswählen."] };
  const ziel = new FormData();
  ziel.set("datei", datei, datei.name);
  const g = fd.get("gesellschaftId");
  if (typeof g === "string" && g) ziel.set("gesellschaftId", g);
  try {
    const r = await api<{ neu: number; doppelt: number; gesellschaft: { nr: number; name: string } }>("/bankabgleich/import", { method: "POST", body: ziel });
    return fertig(`${r.gesellschaft.nr} ${r.gesellschaft.name}: ${r.neu} neue Umsätze eingelesen${r.doppelt ? `, ${r.doppelt} bereits vorhanden` : ""}.`);
  } catch (e) {
    return alsErgebnis(e);
  }
}

export async function vorschlaegeUebernehmen(gesellschaftId: string): Promise<AktionsErgebnis> {
  try {
    const r = await api<{ uebernommen: number }>("/bankabgleich/vorschlaege", { method: "POST", body: { gesellschaftId } });
    return fertig(r.uebernommen ? `${r.uebernommen} Umsätze zugeordnet.` : "Keine sicheren Vorschläge offen.");
  } catch (e) {
    return alsErgebnis(e);
  }
}

/** Vorschlag oder manuelle Zuordnung; Werte als JSON im Feld „zuordnung“ bzw. aus den Eingabefeldern. */
export async function zuordnen(id: string, fd: FormData): Promise<AktionsErgebnis> {
  const fest = fd.get("zuordnung");
  let body: unknown;
  if (typeof fest === "string" && fest) body = JSON.parse(fest);
  else if (fd.get("art") === "anforderung") {
    const posten = [1, 2, 3]
      .map((i) => ({ id: String(fd.get(`anforderung${i}`) ?? ""), betrag: String(fd.get(`betrag${i}`) ?? "") }))
      .filter((p) => p.id);
    body = { art: "anforderung", posten };
  } else {
    const wahl = String(fd.get("ziel") ?? "");
    const [art, zielId] = wahl.split(":");
    body = { art, id: zielId };
  }
  try {
    await api(`/bankabgleich/umsaetze/${id}/zuordnen`, { method: "POST", body });
  } catch (e) {
    return alsErgebnis(e);
  }
  return fertig();
}

export async function ignorieren(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/bankabgleich/umsaetze/${id}/ignorieren`, { method: "POST", body: { bemerkung: fd.get("bemerkung") ?? "" } });
  } catch (e) {
    return alsErgebnis(e);
  }
  return fertig();
}

export async function zuruecksetzen(id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/bankabgleich/umsaetze/${id}/zuruecksetzen`, { method: "POST" });
  } catch (e) {
    return alsErgebnis(e);
  }
  return fertig();
}
