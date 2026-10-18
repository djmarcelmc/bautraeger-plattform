"use server";

import { ZAEHLER } from "@bt/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

/** Formular → API: Zählerstände kommen als Felder „zaehler_<art>“. */
function abnahmeDaten(fd: FormData) {
  const d = formularDaten(fd);
  const zaehler = Object.fromEntries(ZAEHLER.map((z) => [z, String(fd.get(`zaehler_${z}`) ?? "")]));
  for (const z of ZAEHLER) delete d[`zaehler_${z}`];
  return { ...d, zaehler };
}

export async function abnahmeAnlegen(projektId: string, fd: FormData): Promise<AktionsErgebnis> {
  let id: string;
  try {
    id = (await api<{ id: string }>(`/projekte/${projektId}/abnahmen`, { method: "POST", body: abnahmeDaten(fd) })).id;
  } catch (e) {
    return alsErgebnis(e);
  }
  redirect(`/abnahmen/${id}`);
}

async function ausfuehren(id: string, fn: () => Promise<unknown>, meldung: string): Promise<AktionsErgebnis> {
  try {
    await fn();
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(`/abnahmen/${id}`);
  return { meldung };
}

export async function abnahmeAendern(id: string, fd: FormData) {
  return ausfuehren(id, () => api(`/abnahmen/${id}`, { method: "PUT", body: abnahmeDaten(fd) }), "Gespeichert.");
}

export async function abnahmeMaengel(id: string, fd: FormData) {
  let n = 0;
  const r = await ausfuehren(
    id,
    async () => {
      n = (await api<{ angelegt: number }>(`/abnahmen/${id}/maengel`, { method: "POST", body: formularDaten(fd, { listen: ["vorlageIds"] }) })).angelegt;
    },
    "",
  );
  return r.fehler ? r : { meldung: n === 1 ? "1 Mangel erfasst." : `${n} Mängel erfasst.` };
}

export async function abnahmeAbschliessen(id: string, fd: FormData) {
  return ausfuehren(id, () => api(`/abnahmen/${id}/abschliessen`, { method: "POST", body: formularDaten(fd) }), "Abnahme abgeschlossen.");
}

export async function abnahmeLoeschen(id: string, projektId: string): Promise<AktionsErgebnis> {
  try {
    await api(`/abnahmen/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  redirect(`/projekte/${projektId}?reiter=abnahmen`);
}

export async function vorlageAnlegen(fd: FormData) {
  try {
    await api("/mangelvorlagen", { method: "POST", body: formularDaten(fd) });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/einstellungen");
  return { meldung: "Vorlage angelegt." };
}

export async function vorlageLoeschen(id: string) {
  try {
    await api(`/mangelvorlagen/${id}`, { method: "DELETE" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/einstellungen");
  return {};
}

export async function standardkatalogUebernehmen() {
  try {
    await api("/mangelvorlagen/standard", { method: "POST" });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath("/einstellungen");
  return { meldung: "Standardkatalog übernommen." };
}
