"use server";

import type { SaldenZeile } from "@bt/domain";
import { api } from "@/lib/api";
import { alsErgebnis } from "@/lib/formular";

export interface Saldenliste {
  gesellschaft: { id: string; nr: number; name: string };
  stichtag: string;
  mitDatev: boolean;
  zeilen: SaldenZeile[];
  summen: Record<"debitor" | "kreditor", { journal: string; op: string; datev: string | null; abweichungen: number }>;
}

/** Saldenliste mit DATEV-Vergleich (die hochgeladene Datei wird nicht gespeichert). */
export async function mitDatevVergleichen(gesellschaftId: string, stichtag: string, fd: FormData): Promise<{ daten?: Saldenliste; fehler?: string[] }> {
  const datei = fd.get("datei");
  if (!(datei instanceof File) || !datei.size) return { fehler: ["Bitte die Saldenliste aus DATEV (CSV) auswählen."] };
  const ziel = new FormData();
  ziel.set("datei", datei, datei.name);
  ziel.set("gesellschaftId", gesellschaftId);
  ziel.set("stichtag", stichtag);
  try {
    return { daten: await api<Saldenliste>("/buchhaltung/saldenliste", { method: "POST", body: ziel }) };
  } catch (e) {
    return { fehler: alsErgebnis(e).fehler ?? ["Vergleich fehlgeschlagen"] };
  }
}
