import { deZahl } from "@/lib/format";
import type { LiquiditaetsWoche } from "@/lib/typen";

/** Balken für Ein-/Auszahlungen je Kalenderwoche und Linie für den Bestand (SVG, serverseitig). */
export function LiquiditaetsDiagramm({ wochen, anfangsbestand }: { wochen: LiquiditaetsWoche[]; anfangsbestand: string }) {
  const B = 1000;
  const H = 280;
  const rand = { l: 64, r: 12, o: 14, u: 26 };
  const werte = wochen.flatMap((w) => [Number(w.einSumme), -Number(w.ausSumme), Number(w.bestand)]).concat(Number(anfangsbestand), 0);
  let max = Math.max(...werte);
  let min = Math.min(...werte);
  if (max === min) max = min + 1;
  const schritt = 10 ** Math.floor(Math.log10((max - min) / 4 || 1));
  const raster = [1, 2, 2.5, 5, 10].map((f) => f * schritt).find((s) => (max - min) / s <= 6) ?? schritt * 10;
  max = Math.ceil(max / raster) * raster;
  min = Math.floor(min / raster) * raster;
  const y = (v: number) => rand.o + ((max - v) / (max - min)) * (H - rand.o - rand.u);
  const spalte = (B - rand.l - rand.r) / wochen.length;
  const x = (i: number) => rand.l + i * spalte;
  const bw = Math.max(2, spalte * 0.36);
  const linien: number[] = [];
  for (let v = min; v <= max + 1e-6; v += raster) linien.push(v);
  const kurz = (v: number) => (Math.abs(v) >= 1e6 ? `${deZahl(v / 1e6, 1)} Mio.` : Math.abs(v) >= 1e3 ? `${deZahl(v / 1e3, 0)} T` : deZahl(v, 0));
  const pfad = wochen.map((w, i) => `${i ? "L" : "M"}${(x(i) + spalte / 2).toFixed(1)},${y(Number(w.bestand)).toFixed(1)}`).join(" ");
  const jedeN = Math.ceil(wochen.length / 18);
  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="liqdiagramm" role="img" aria-label="Liquiditätsverlauf nach Kalenderwochen">
      {linien.map((v) => (
        <g key={v}>
          <line x1={rand.l} x2={B - rand.r} y1={y(v)} y2={y(v)} className={v === 0 ? "achse" : "raster"} />
          <text x={rand.l - 8} y={y(v) + 4} textAnchor="end" className="beschriftung">
            {kurz(v)}
          </text>
        </g>
      ))}
      {wochen.map((w, i) => (
        <g key={w.von}>
          <title>{`KW ${w.woche}/${w.jahr}: Einnahmen ${deZahl(w.einSumme)} €, Ausgaben ${deZahl(w.ausSumme)} €, Bestand ${deZahl(w.bestand)} €`}</title>
          {Number(w.einSumme) > 0 && <rect x={x(i) + spalte / 2 - bw} y={y(Number(w.einSumme))} width={bw} height={y(0) - y(Number(w.einSumme))} className="ein" rx={1.5} />}
          {Number(w.ausSumme) > 0 && <rect x={x(i) + spalte / 2} y={y(0)} width={bw} height={y(-Number(w.ausSumme)) - y(0)} className="aus" rx={1.5} />}
          {i % jedeN === 0 && (
            <text x={x(i) + spalte / 2} y={H - 8} textAnchor="middle" className="beschriftung">
              {w.woche}
            </text>
          )}
        </g>
      ))}
      <path d={pfad} className="bestand" />
      {wochen.map((w, i) => (Number(w.bestand) < 0 ? <circle key={w.von} cx={x(i) + spalte / 2} cy={y(Number(w.bestand))} r={2.6} className="unterdeckung" /> : null))}
    </svg>
  );
}
