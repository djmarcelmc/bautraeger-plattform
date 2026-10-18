import { z } from "zod";
import { pflichttext, text } from "./felder.js";

/** Höchstzahl Meldungen je Link in 24 Stunden (Missbrauchsschutz). */
export const PORTAL_MAX_MELDUNGEN_TAG = 10;
export const PORTAL_MAX_FOTOS = 5;
export const PORTAL_MAX_FOTO_BYTES = 10 * 1024 * 1024;

export const PortalMeldung = z.object({
  einheitId: z.uuid("Einheit wählen"),
  bereich: z.enum(["sonder", "gemeinschaft"]).default("sonder"),
  titel: pflichttext(150),
  ort: text(150),
  beschreibung: text(3000),
  kontakt: text(200),
});
export type PortalMeldung = z.infer<typeof PortalMeldung>;

export const PortalLinkEingabe = z.object({
  gueltigBis: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type PortalStatus = "eingegangen" | "in_bearbeitung" | "erledigt";
export const PORTAL_STATUS_TEXT: Record<PortalStatus, string> = { eingegangen: "eingegangen", in_bearbeitung: "in Bearbeitung", erledigt: "erledigt" };

/** Vereinfachter Status für Käufer: interne Details (Handwerker, Rügen) werden nicht gezeigt. */
export function portalStatus(m: { erledigtAm: string | null; handwerkerId: string | null }, ruegen: number): PortalStatus {
  if (m.erledigtAm) return "erledigt";
  return m.handwerkerId || ruegen > 0 ? "in_bearbeitung" : "eingegangen";
}

/** Erkennt Bildformate an den ersten Bytes (JPEG, PNG, WebP, HEIC/HEIF). */
export function bildformat(kopf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  const b = (i: number) => kopf[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  const ascii = (von: number, bis: number) => String.fromCharCode(...kopf.slice(von, bis));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1", "heif"].includes(ascii(8, 12))) return "image/heic";
  return null;
}

/** Ordner der Dokumentablage, deren Inhalte Käufer im Portal sehen. */
export const PORTAL_ORDNER = ["Schriftverkehr", "Käuferportal"] as const;

export type PortalRatenStand = "nicht_faellig" | "demnaechst" | "angefordert" | "ueberfaellig" | "teilbezahlt" | "bezahlt" | "verrechnet";
export const PORTAL_RATEN_TEXT: Record<PortalRatenStand, string> = {
  nicht_faellig: "noch nicht fällig",
  demnaechst: "Bautenstand erreicht – Anforderung folgt",
  angefordert: "angefordert",
  ueberfaellig: "überfällig",
  teilbezahlt: "teilweise bezahlt",
  bezahlt: "bezahlt",
  verrechnet: "verrechnet",
};

/**
 * Ratenstand aus Käufersicht. Interne Zustände (z. B. gesperrt wegen fehlender Fälligkeitsvoraussetzungen)
 * erscheinen als „noch nicht fällig“.
 */
export function portalRatenStand(r: { status: string; betrag: string; faelligAm: string | null }, stichtag: string): PortalRatenStand {
  if (Number(r.betrag) < 0) return r.status === "offen" || r.status === "anforderbar" || r.status === "gesperrt" ? "nicht_faellig" : "verrechnet";
  if (r.status === "bezahlt") return "bezahlt";
  if (r.status === "teilbezahlt") return r.faelligAm && r.faelligAm < stichtag ? "ueberfaellig" : "teilbezahlt";
  if (r.status === "angefordert") return r.faelligAm && r.faelligAm < stichtag ? "ueberfaellig" : "angefordert";
  if (r.status === "anforderbar") return "demnaechst";
  return "nicht_faellig";
}
