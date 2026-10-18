"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

/** Baut aus dem Formular „Neuer Kaufvertrag“ die API-Eingabe. */
export async function kaufvertragAnlegen(projektId: string, fd: FormData): Promise<AktionsErgebnis> {
  const einheiten = fd.getAll("einheit").map(String).map((einheitId) => ({ einheitId, vkBrutto: String(fd.get(`vk_${einheitId}`) ?? "") }));
  const kaeufer = [1, 2]
    .map((i) => ({ partnerId: String(fd.get(`kaeufer${i}`) ?? ""), anteilProzent: String(fd.get(`anteil${i}`) ?? "") }))
    .filter((k) => k.partnerId);
  const f = formularDaten(fd, { haken: ["vertragWirksam", "lastenfreistellungGesichert", "buergschaftNach7", "erbbaurecht"] });
  let id: string;
  try {
    id = (
      await api<{ id: string }>("/kaufvertraege", {
        method: "POST",
        body: {
          projektId,
          datum: f.datum,
          urkundennr: f.urkundennr,
          zahlungsanforderungAn: kaeufer[0]?.partnerId ?? "",
          vertragWirksam: f.vertragWirksam,
          vormerkungEingetragenAm: f.vormerkungEingetragenAm,
          lastenfreistellungGesichert: f.lastenfreistellungGesichert,
          buergschaftNach7: f.buergschaftNach7,
          erbbaurecht: f.erbbaurecht,
          zahlungszielTage: f.zahlungszielTage,
          kaeufer: kaeufer.length === 1 ? [{ ...kaeufer[0], anteilProzent: "100" }] : kaeufer,
          einheiten,
        },
      })
    ).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/verkauf");
  redirect(`/kaufvertraege/${id}`);
}

export async function konditionenSpeichern(id: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api(`/kaufvertraege/${id}/konditionen`, {
      method: "PUT",
      body: formularDaten(fd, { haken: ["vertragWirksam", "lastenfreistellungGesichert", "buergschaftNach7", "anforderungssperre", "mahnsperre", "verbraucher"] }),
    });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/kaufvertraege/${id}`);
  return { meldung: "Gespeichert." };
}

export async function ratenAnfordern(vertragId: string, fd: FormData): Promise<AktionsErgebnis> {
  const rateIds = fd.getAll("rate").map(String);
  if (!rateIds.length) return { fehler: ["Bitte mindestens eine anforderbare Rate auswählen."] };
  let id: string;
  try {
    id = (await api<{ id: string }>("/zahlungsanforderungen", { method: "POST", body: { rateIds, datum: fd.get("datum") } })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/kaufvertraege/${vertragId}`);
  redirect(`/zahlungsanforderungen/${id}`);
}

export async function zahlungErfassen(pfad: string, fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api("/zahlungseingaenge", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad);
  revalidatePath("/verkauf");
  return { meldung: "Zahlung verbucht." };
}

export async function bautenstandMelden(projektId: string, fd: FormData): Promise<AktionsErgebnis> {
  let gemeldet: number;
  try {
    gemeldet = (
      await api<{ gemeldet: number }>(`/projekte/${projektId}/bautenstand`, {
        method: "POST",
        body: { einheitIds: fd.getAll("einheit").map(String), abschnitt: fd.get("abschnitt"), fertigAm: fd.get("fertigAm") },
      })
    ).gemeldet;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  return { meldung: gemeldet ? `${gemeldet} Fertigmeldung(en) gespeichert.` : "Alle gewählten Einheiten waren bereits gemeldet." };
}

export async function bautenstandZuruecknehmen(projektId: string, id: string): Promise<AktionsErgebnis> {
  try {
    await api(`/bautenstand/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  return {};
}

export async function sammelanforderung(projektId: string, fd: FormData): Promise<AktionsErgebnis> {
  let anzahl: number;
  try {
    anzahl = (await api<{ anzahl: number }>(`/projekte/${projektId}/zahlungsanforderungen`, { method: "POST", body: { datum: fd.get("datum") } })).anzahl;
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/projekte/${projektId}`);
  revalidatePath("/verkauf");
  return anzahl ? { meldung: `${anzahl} Zahlungsanforderung(en) erstellt – zu finden unter Verkauf › Offene Posten.` } : { fehler: ["Derzeit ist keine Rate anforderbar."] };
}

export async function mahnlauf(fd: FormData): Promise<AktionsErgebnis> {
  const ids = fd.getAll("posten").map(String);
  if (!ids.length) return { fehler: ["Bitte mindestens einen Posten auswählen."] };
  let r: { erstellt: string[]; uebersprungen: { rechnungsnr: string; grund: string }[] };
  try {
    r = await api("/mahnungen", { method: "POST", body: { zahlungsanforderungIds: ids, datum: fd.get("datum"), mahngebuehr: fd.get("mahngebuehr") } });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/verkauf");
  if (!r.erstellt.length) return { fehler: ["Keine Mahnung erstellt: " + r.uebersprungen.map((u) => `${u.rechnungsnr} (${u.grund})`).join(", ")] };
  redirect(`/mahnungen/druck?ids=${r.erstellt.join(",")}`);
}

export async function basiszinsSpeichern(fd: FormData): Promise<AktionsErgebnis> {
  try {
    await api("/basiszinssaetze", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/einstellungen");
  return { meldung: "Basiszinssatz gespeichert." };
}
