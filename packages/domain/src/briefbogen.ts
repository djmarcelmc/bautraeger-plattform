import { z } from "zod";

// Briefbogen je Gesellschaft: Das PDF liegt in der Dokumentablage; die Schreiben werden im Satzspiegel
// (Ränder, optionale Felder für Datum und Zeichen) gesetzt und der Briefbogen beim PDF hinterlegt.

const mm = (min = 0, max = 150) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().replace(",", ".") : v), z.coerce.number("Zahl in mm angeben").min(min, `mindestens ${min} mm`).max(max, `höchstens ${max} mm`));
const mmOptional = (max = 297) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? v.trim().replace(",", ".") : v), z.coerce.number("Zahl in mm angeben").min(0).max(max).nullable());

export const BriefbogenEinstellung = z
  .object({
    /** Abstand der Anschrift vom oberen Blattrand auf der ersten Seite */
    randObenErsteSeite: mm(10, 120).default(45),
    randObenFolgeseiten: mm(5, 80).default(30),
    randUnten: mm(5, 80).default(25),
    randLinks: mm(5, 60).default(25),
    randRechts: mm(5, 60).default(20),
    /** Brieftext (Betreff) frühestens ab dieser Höhe auf der ersten Seite – z. B. unter vorgedruckten Feldern */
    textAb: mmOptional(),
    /** Eigene Absenderzeile weglassen, weil der Briefbogen eine Rücksendezeile hat */
    absenderzeileAusblenden: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(true),
    /** Datum in ein vorgedrucktes Feld setzen (Position der Textoberkante) */
    datumX: mmOptional(210),
    datumY: mmOptional(),
    /** „Unser Zeichen“ in ein vorgedrucktes Feld setzen */
    zeichenX: mmOptional(210),
    zeichenY: mmOptional(),
    zeichenText: z.string().trim().max(20).optional().transform((s) => s || null),
  })
  .refine((e) => (e.datumX === null) === (e.datumY === null), { message: "Für das Datumsfeld beide Werte angeben", path: ["datumY"] })
  .refine((e) => (e.zeichenX === null) === (e.zeichenY === null), { message: "Für das Zeichenfeld beide Werte angeben", path: ["zeichenY"] })
  .refine((e) => e.textAb === null || e.textAb > e.randObenErsteSeite, { message: "„Text ab“ muss unter dem oberen Rand liegen", path: ["textAb"] });
export type BriefbogenEinstellung = z.infer<typeof BriefbogenEinstellung>;

export const BRIEFBOGEN_STANDARD: BriefbogenEinstellung = BriefbogenEinstellung.parse({});

/**
 * CSS für Schreiben auf dem Briefbogen. Am Bildschirm entspricht das Blatt dem A4-Satzspiegel; im Druck gelten
 * die Ränder je Seite (die erste Seite eines Schreibens bekommt zusätzlich Abstand bis zur Anschrift), sodass auch
 * auf vorgedrucktem Briefpapier gedruckt werden kann. Felder für Datum/Zeichen sind absolut positioniert.
 */
export function briefbogenCss(e: BriefbogenEinstellung): string {
  const f = (n: number) => `${Math.round(n * 10) / 10}mm`;
  const zusatzOben = Math.max(0, e.randObenErsteSeite - e.randObenFolgeseiten);
  const kopf = e.textAb !== null ? e.textAb - e.randObenErsteSeite : null;
  const feld = (x: number | null, y: number | null, klasse: string) =>
    x === null || y === null
      ? ""
      : `@media screen { .schreiben.briefbogen .${klasse} { top: ${f(y)}; left: ${f(x)}; } }
@media print { .schreiben.briefbogen .${klasse} { top: ${f(y - e.randObenFolgeseiten)}; left: ${f(x - e.randLinks)}; } }`;
  return `.schreiben.briefbogen { position: relative; }
.schreiben.briefbogen .briefbogen-feld { position: absolute; font-size: 12.5px; white-space: nowrap; }
${e.absenderzeileAusblenden ? ".schreiben.briefbogen header .absender { visibility: hidden; }" : ""}
${kopf !== null ? `.schreiben.briefbogen header { min-height: ${f(kopf)}; margin-bottom: 0; align-content: start; align-items: start; }
.schreiben.briefbogen header .infoblock { align-content: start; }` : ""}
${e.datumX !== null ? ".schreiben.briefbogen .info-datum { display: none; }" : ""}
@media screen {
  .schreiben.briefbogen { width: 210mm; max-width: 100%; min-height: 297mm; box-sizing: border-box; padding: ${f(e.randObenErsteSeite)} ${f(e.randRechts)} ${f(e.randUnten)} ${f(e.randLinks)}; border-radius: 4px; }
}
@media print {
  /* transparent, damit der hinterlegte Briefbogen (bzw. vorgedrucktes Papier) sichtbar bleibt */
  html, body, .layout, main, .schreiben.briefbogen { background: transparent !important; }
  @page { size: A4; margin: ${f(e.randObenFolgeseiten)} ${f(e.randRechts)} ${f(e.randUnten)} ${f(e.randLinks)}; }
  .schreiben.briefbogen { padding: ${f(zusatzOben)} 0 0 0 !important; }
}
${feld(e.datumX, e.datumY, "briefbogen-datum")}
${feld(e.zeichenX, e.zeichenY, "briefbogen-zeichen")}`;
}
