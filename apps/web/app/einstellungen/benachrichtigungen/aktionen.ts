"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, formularDaten, type AktionsErgebnis } from "@/lib/formular";

const PFAD = "/einstellungen/benachrichtigungen";

async function ausfuehren(fn: () => Promise<unknown>, meldung: string): Promise<AktionsErgebnis> {
  try {
    await fn();
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(PFAD);
  return { meldung };
}

export async function empfaengerSpeichern(fd: FormData) {
  return ausfuehren(() => api("/benachrichtigungen/einstellungen", { method: "PUT", body: formularDaten(fd, { haken: ["kaeuferInformieren"] }) }), "Gespeichert.");
}

export async function testmailSenden(fd: FormData) {
  return ausfuehren(() => api("/benachrichtigungen/test", { method: "POST", body: formularDaten(fd) }), "Testnachricht in den Postausgang gestellt – Status siehe unten.");
}

export async function aufgabenJetzt() {
  let r: { eingereiht: boolean; grund?: string } = { eingereiht: false };
  const e = await ausfuehren(async () => {
    r = await api("/benachrichtigungen/aufgaben", { method: "POST" });
  }, "");
  if (e.fehler) return e;
  return r.eingereiht ? { meldung: "Aufgabenübersicht verschickt." } : { fehler: [r.grund === "keine Empfänger" ? "Bitte zuerst Empfänger für die Aufgabenübersicht eintragen." : "Derzeit keine offenen Aufgaben."] };
}

export async function erneutSenden(id: string) {
  return ausfuehren(() => api(`/benachrichtigungen/nachrichten/${id}/erneut`, { method: "POST" }), "Erneut gesendet.");
}
