import "server-only";

const BASIS = process.env.API_URL ?? "http://localhost:3001";

export class ApiFehler extends Error {
  constructor(
    public status: number,
    public fehler: string[],
  ) {
    super(fehler.join("; "));
  }
}

/** Serverseitiger API-Aufruf. Benutzer wird bis zur Entra-Anmeldung als Platzhalter übergeben. */
export async function api<T = unknown>(pfad: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const multipart = init.body instanceof FormData;
  const res = await fetch(`${BASIS}/api${pfad}`, {
    method: init.method ?? "GET",
    headers: {
      ...(multipart ? {} : { "content-type": "application/json" }),
      "x-benutzer": "web (noch ohne Anmeldung)",
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
export function apiRoh(pfad: string) {
  return fetch(`${BASIS}/api${pfad}`, { headers: { "x-benutzer": "web (noch ohne Anmeldung)" }, cache: "no-store" });
}
