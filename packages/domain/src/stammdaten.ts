import { z } from "zod";
import { datum, dezimal, ganzzahl, ganzzahlOptional, geld, leerAlsUndefiniert, pflichttext, text, uuidOptional } from "./felder.js";

export { normalisiereDezimal } from "./felder.js";

/** Prüft eine IBAN über die Prüfziffer (ISO 13616, Modulo 97). */
export function ibanGueltig(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("DE") && s.length !== 22) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return rest === 1;
}

/** Prüft einen BIC (8 oder 11 Stellen). */
export const bicGueltig = (bic: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic.replace(/\s/g, "").toUpperCase());

const ibanFeld = () =>
  z
    .string()
    .transform((s) => s.replace(/\s/g, "").toUpperCase())
    .refine((s) => s === "" || ibanGueltig(s), "Ungültige IBAN (Prüfziffer)")
    .transform((s) => (s === "" ? null : s))
    .nullish();
const bicFeld = () =>
  z
    .string()
    .transform((s) => s.replace(/\s/g, "").toUpperCase())
    .refine((s) => s === "" || bicGueltig(s), "Ungültiger BIC (8 oder 11 Zeichen)")
    .transform((s) => (s === "" ? null : s))
    .nullish();

// ---------------------------------------------------------------- Gesellschaft

export const GesellschaftEingabe = z.object({
  nr: ganzzahl().positive(),
  name: pflichttext(),
  anschrift: text(500),
  datevBeraternr: ganzzahlOptional(1000, 9999999),
  datevMandantennr: ganzzahlOptional(1, 99999),
  skr: z.enum(["03", "04"]).default("03"),
  sachkontenlaenge: leerAlsUndefiniert(ganzzahl().min(4).max(8).default(4)),
  /** Auftraggeberkonto für SEPA-Überweisungen. */
  iban: ibanFeld(),
  bic: bicFeld(),
});
export type GesellschaftEingabe = z.infer<typeof GesellschaftEingabe>;

// ---------------------------------------------------------------- Geschäftspartner

export const PARTNER_ROLLEN = ["kunde", "interessent", "handwerker", "lieferant", "notar", "makler", "bank", "sonstige"] as const;

export const PartnerEingabe = z
  .object({
    nr: ganzzahl().positive(),
    suchcode: pflichttext(40).transform((s) => s.toUpperCase()),
    firma: text(),
    anrede: text(40),
    vorname: text(100),
    nachname: text(100),
    strasse: text(),
    plz: text(10),
    ort: text(100),
    email: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .pipe(z.email("Ungültige E-Mail-Adresse").nullable())
      .nullish(),
    telefon: text(50),
    iban: ibanFeld(),
    bic: bicFeld(),
    rollen: z.array(z.enum(PARTNER_ROLLEN)).min(1, "Mindestens eine Rolle wählen"),
    freistellungGueltigBis: datum(),
  })
  .refine((p) => p.firma || p.nachname, { message: "Firma oder Nachname angeben", path: ["nachname"] });
export type PartnerEingabe = z.infer<typeof PartnerEingabe>;

// ---------------------------------------------------------------- Projekt

export const PROJEKTARTEN = ["bautraeger", "werkvertrag", "gemischt"] as const;
export const PROJEKTART_TEXT: Record<(typeof PROJEKTARTEN)[number], string> = {
  bautraeger: "Bauträgerprojekt (ohne MwSt.)",
  werkvertrag: "Werkvertrag (100 % MwSt.)",
  gemischt: "gemischt (gewerblicher Anteil)",
};

export const ProjektEingabe = z.object({
  gesellschaftId: z.uuid("Gesellschaft wählen"),
  nr: ganzzahl().positive(),
  suchcode: pflichttext(40).transform((s) => s.toUpperCase()),
  strasse: text(),
  plz: text(10),
  ort: text(100),
  art: z.enum(PROJEKTARTEN).default("bautraeger"),
  para13bAnwendbar: z.boolean().default(false),
  grundbuchamt: text(100),
  grundbuchBlatt: text(50),
  flurstueck: text(100),
  kostenstelle: text(20),
  projektbeginn: datum(),
  baubeginnSoll: datum(),
  baubeginnIst: datum(),
  fertigstellungSoll: datum(),
  fertigstellungIst: datum(),
  abgeschlossen: z.boolean().default(false),
});
export type ProjektEingabe = z.infer<typeof ProjektEingabe>;

export const ProjektKopieren = z.object({
  nr: ganzzahl().positive(),
  suchcode: pflichttext(40).transform((s) => s.toUpperCase()),
  einheitenKopieren: z.boolean().default(false),
  gewerkeKopieren: z.boolean().default(false),
});
export type ProjektKopieren = z.infer<typeof ProjektKopieren>;

// ---------------------------------------------------------------- Einheit

export const EINHEIT_TYPEN = ["wohnung", "stellplatz", "gewerbe", "hobbyraum", "sonstiges"] as const;
export const EINHEIT_TYP_TEXT: Record<(typeof EINHEIT_TYPEN)[number], string> = {
  wohnung: "Wohneinheit",
  stellplatz: "Stellplatz/Garage",
  gewerbe: "Gewerbeeinheit",
  hobbyraum: "Hobbyraum",
  sonstiges: "Sonstiges",
};

export const EinheitEingabe = z.object({
  nr: pflichttext(20),
  typ: z.enum(EINHEIT_TYPEN),
  bauabschnitt: leerAlsUndefiniert(ganzzahl().min(1).default(1)),
  etage: text(40),
  art: text(100),
  wohnflaeche: dezimal(2),
  miteigentumTsd: dezimal(3),
  preisProM2: geld(),
  vkBrutto: geld(),
  mindestVk: geld(),
  zugehoerigZuEinheitId: uuidOptional(),
});
export type EinheitEingabe = z.infer<typeof EinheitEingabe>;

/** Fehlerliste in Klartext, z. B. für Formulare: „suchcode: Pflichtfeld“. */
export function fehlertexte(e: z.ZodError): string[] {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}
