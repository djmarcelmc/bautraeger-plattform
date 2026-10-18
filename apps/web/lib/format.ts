/** "312448.00" → "312.448,00" (für Anzeige und Formularvorbelegung). */
export function deZahl(wert: string | number | null | undefined, nachkomma = 2): string {
  if (wert === null || wert === undefined || wert === "") return "";
  const n = Number(wert);
  if (Number.isNaN(n)) return String(wert);
  return n.toLocaleString("de-DE", { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });
}

export function deDatum(iso: string | null | undefined): string {
  if (!iso) return "";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}

export function deZeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
