import { ApiFehler } from "./api";

export interface AktionsErgebnis {
  fehler?: string[];
  meldung?: string;
}

/** FormData → Objekt. Checkboxen (name in `haken`) werden zu true/false, Mehrfachauswahl (in `listen`) zu Arrays. */
export function formularDaten(fd: FormData, opt: { haken?: string[]; listen?: string[] } = {}) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (!k.startsWith("$") && typeof v === "string") o[k] = v;
  for (const k of opt.haken ?? []) o[k] = fd.get(k) === "on";
  for (const k of opt.listen ?? []) o[k] = fd.getAll(k).map(String);
  return o;
}

/** Wandelt API-Fehler in eine Fehlerliste fürs Formular; andere Fehler (auch redirect) werden weitergereicht. */
export function alsErgebnis(e: unknown): AktionsErgebnis {
  if (e instanceof ApiFehler) return { fehler: e.fehler };
  throw e;
}
