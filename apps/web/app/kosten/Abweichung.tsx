import { deZahl } from "@/lib/format";

/** Abweichung geschätzt − Trend: positiv = Einsparung (grün), negativ = Mehrkosten (rot). */
export function Abweichung({ wert }: { wert: string }) {
  const n = Number(wert);
  if (!n) return <span className="hint">0,00</span>;
  return <span className={n > 0 ? "plus" : "minus"}>{n > 0 ? "+" : ""}{deZahl(wert)}</span>;
}
