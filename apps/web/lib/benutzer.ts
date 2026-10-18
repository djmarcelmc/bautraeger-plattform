import "server-only";
import { auth, authAktiv } from "@/auth";

export interface Benutzer {
  name: string;
  email: string;
  rollen: string[];
}

/** Angemeldeter Benutzer; null, wenn die Microsoft-Anmeldung (noch) nicht aktiv ist. */
export async function aktuellerBenutzer(): Promise<Benutzer | null> {
  if (!authAktiv) return null;
  const s = await auth();
  if (!s?.user) return null;
  return { name: s.user.name ?? s.user.email ?? "unbekannt", email: s.user.email ?? "", rollen: s.user.rollen ?? [] };
}
