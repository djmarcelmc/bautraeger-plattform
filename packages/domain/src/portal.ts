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
