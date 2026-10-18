import "server-only";
import { aktuellerBenutzer } from "./benutzer";

const BASIS = process.env.API_URL ?? "http://localhost:3001";

export class ApiFehler extends Error {
  constructor(
    public status: number,
    public fehler: string[],
  ) {
    super(fehler.join("; "));
  }
}

/** Benutzer und Rollen für die API (ohne Microsoft-Anmeldung: Platzhalter, die API prüft dann keine Rollen). */
async function kennung(): Promise<Record<string, string>> {
  const b = await aktuellerBenutzer();
  return b ? { "x-benutzer": b.email || b.name, "x-rollen": b.rollen.join(",") } : { "x-benutzer": "web (noch ohne Anmeldung)" };
}

/** Serverseitiger API-Aufruf im Namen des angemeldeten Benutzers. */
export async function api<T = unknown>(pfad: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const multipart = init.body instanceof FormData;
  const res = await fetch(`${BASIS}/api${pfad}`, {
    method: init.method ?? "GET",
    headers: {
      ...(multipart ? {} : { "content-type": "application/json" }),
      ...(await kennung()),
    },
    body: init.body === undefined ? undefined : multipart ? (init.body as FormData) : JSON.stringify(init.body),
    cache: "no-store",
  });
  const daten = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const fehler: string[] = daten?.fehler ?? [typeof daten?.message === "string" ? daten.message : `Fehler ${res.status}`];
    throw new ApiFehler(res.status, fehler);
  }
  return daten as T;
}

/** Rohe Antwort (z. B. für Datei-Downloads). */
export async function apiRoh(pfad: string, init: { method?: string; body?: unknown } = {}) {
  const multipart = init.body instanceof FormData;
  return fetch(`${BASIS}/api${pfad}`, {
    method: init.method ?? "GET",
    headers: { ...(init.body === undefined || multipart ? {} : { "content-type": "application/json" }), ...(await kennung()) },
    body: init.body === undefined ? undefined : multipart ? (init.body as FormData) : JSON.stringify(init.body),
    cache: "no-store",
  });
}
