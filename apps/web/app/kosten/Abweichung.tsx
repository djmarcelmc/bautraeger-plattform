import { deZahl } from "@/lib/format";

/** Abweichung geschätzt − Trend: positiv = Einsparung (grün), negativ = Mehrkosten (rot). */
export function Abweichung({ wert, stellen = 2 }: { wert: string; stellen?: number }) {
  const n = Number(wert);
  if (!n) return <span className="hint">{deZahl(0, stellen)}</span>;
  return <span className={n > 0 ? "plus" : "minus"}>{n > 0 ? "+" : ""}{deZahl(wert, stellen)}</span>;
}
