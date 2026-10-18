"use server";

import { UMLAGE_ARTEN } from "@bt/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

async function ausfuehren(fn: () => Promise<unknown>, pfade: string[], meldung?: string): Promise<AktionsErgebnis> {
  try {
    await fn();
  } catch (e) {
    return alsErgebnis(e);
  }
  for (const p of pfade) revalidatePath(p);
  return meldung ? { meldung } : {};
}

export async function gewerkeplanAnlegen(projektId: string, fd: FormData) {
  return ausfuehren(() => api(`/projekte/${projektId}/gewerkeplan`, { method: "POST", body: formularDaten(fd) }), [`/projekte/${projektId}`], "Gewerkeplan angelegt.");
}

export async function gewerkAnlegen(projektId: string, fd: FormData) {
  return ausfuehren(() => api(`/projekte/${projektId}/gewerke`, { method: "POST", body: formularDaten(fd) }), [`/projekte/${projektId}`], "Gewerk angelegt.");
}

export async function gewerkAendern(id: string, fd: FormData) {
  return ausfuehren(() => api(`/gewerke/${id}`, { method: "PUT", body: formularDaten(fd) }), [`/gewerke/${id}`], "Gespeichert.");
}

/** Vertragsformular → API-Eingabe (Umlagen als eigene Felder „umlage_<art>“). */
function vertragDaten(fd: FormData) {
  const d = formularDaten(fd);
  const umlagen = Object.fromEntries(UMLAGE_ARTEN.map((a) => [a, String(fd.get(`umlage_${a}`) ?? "")]));
  for (const a of UMLAGE_ARTEN) delete d[`umlage_${a}`];
  return { ...d, umlagen };
}

export async function vertragAnlegen(fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/handwerkervertraege", { method: "POST", body: vertragDaten(fd) })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  redirect(`/handwerkervertraege/${id}`);
}

export async function vertragAendern(id: string, fd: FormData) {
  return ausfuehren(() => api(`/handwerkervertraege/${id}`, { method: "PUT", body: vertragDaten(fd) }), [`/handwerkervertraege/${id}`], "Gespeichert.");
}

export async function nachtragAnlegen(vertragId: string, fd: FormData) {
  return ausfuehren(() => api(`/handwerkervertraege/${vertragId}/nachtraege`, { method: "POST", body: formularDaten(fd) }), [`/handwerkervertraege/${vertragId}`], "Nachtrag erfasst.");
}

export async function nachtragAendern(vertragId: string, id: string, fd: FormData) {
  return ausfuehren(() => api(`/nachtraege/${id}`, { method: "PUT", body: formularDaten(fd) }), [`/handwerkervertraege/${vertragId}`]);
}

export async function rechnungErfassen(vertragId: string, fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>("/eingangsrechnungen", { method: "POST", body: { ...formularDaten(fd, { haken: ["schlussrechnung"] }), handwerkervertragId: vertragId } })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/kosten");
  redirect(`/eingangsrechnungen/${id}`);
}

const rechnungPfade = (id: string) => [`/eingangsrechnungen/${id}`, "/kosten"];

export async function rechnungPruefen(id: string, fd: FormData) {
  return ausfuehren(() => api(`/eingangsrechnungen/${id}/pruefen`, { method: "POST", body: formularDaten(fd) }), rechnungPfade(id), "Prüfung gespeichert.");
}

export async function rechnungFreigeben(id: string, fd?: FormData) {
  const body = { ueberschreitungBestaetigt: fd?.get("ueberschreitungBestaetigt") === "on" };
  return ausfuehren(() => api(`/eingangsrechnungen/${id}/freigeben`, { method: "POST", body }), rechnungPfade(id), "Zur Zahlung freigegeben.");
}

export async function rechnungBezahlen(id: string, fd: FormData) {
  return ausfuehren(() => api(`/eingangsrechnungen/${id}/zahlung`, { method: "POST", body: formularDaten(fd) }), rechnungPfade(id), "Zahlung gebucht.");
}

export async function kostenEinstellungSpeichern(fd: FormData) {
  return ausfuehren(() => api("/einstellungen/kosten", { method: "PUT", body: formularDaten(fd) }), ["/einstellungen"], "Budgetschwelle gespeichert.");
}

export async function budgetUmbuchen(projektId: string, fd: FormData) {
  return ausfuehren(() => api(`/projekte/${projektId}/budgetumbuchungen`, { method: "POST", body: formularDaten(fd) }), [`/projekte/${projektId}`, `/gewerke/${fd.get("nachGewerkId")}`, `/gewerke/${fd.get("vonGewerkId")}`], "Budget umgebucht.");
}
