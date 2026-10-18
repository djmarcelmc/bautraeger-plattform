import { z } from "zod";

/** Leerer String → null, sonst getrimmter Text. */
export const text = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullish();

export const pflichttext = (max = 200) => z.string().trim().min(1, "Pflichtfeld").max(max);

/** Zahl im deutschen („1.234,56“) oder technischen („1234.56“) Format → "1234.56"; leer → null. */
export function normalisiereDezimal(eingabe: string): string | null {
  const s = eingabe.trim().replace(/\s|€/g, "");
  if (s === "") return null;
  const n = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(\.\d+)?$/.test(n)) throw new Error(`„${eingabe}“ ist keine gültige Zahl`);
  return n;
}

export const dezimal = (nachkomma: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      try {
        const n = normalisiereDezimal(String(v));
        if (n === null) return null;
        const [, nk = ""] = n.split(".");
        if (nk.length > nachkomma) {
          ctx.addIssue({ code: "custom", message: `Höchstens ${nachkomma} Nachkommastellen` });
          return z.NEVER;
        }
        return n;
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    })
    .nullish();

export const geld = () => dezimal(2);
export const datum = () =>
  z
    .string()
    .trim()
    .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Datum im Format JJJJ-MM-TT")
    .transform((s) => (s === "" ? null : s))
    .nullish();
export const ganzzahl = () => z.coerce.number().int("Ganze Zahl erwartet");
export const uuidOptional = () =>
  z
    .string()
    .transform((s) => (s === "" ? null : s))
    .pipe(z.uuid().nullable())
    .nullish();
