const TEXT: Record<string, [string, string]> = {
  erfasst: ["zu prüfen", "warnung"],
  sachlich_geprueft: ["geprüft", "akzent"],
  rechnerisch_geprueft: ["geprüft – freizugeben", "akzent"],
  freigegeben: ["freigegeben – zu zahlen", "info"],
  bezahlt: ["bezahlt", "gut"],
};

export function RechnungStatus({ status }: { status: string }) {
  const [t, k] = TEXT[status] ?? [status, ""];
  return <span className={`badge ${k}`}>{t}</span>;
}

const SCHRITTE = [
  ["erfasst", "Erfasst"],
  ["geprueft", "Geprüft"],
  ["freigegeben", "Freigegeben"],
  ["bezahlt", "Bezahlt"],
] as const;

/** Fortschrittsanzeige Erfasst → Geprüft → Freigegeben → Bezahlt. */
export function RechnungSchritte({ status }: { status: string }) {
  const stufe = { erfasst: 0, sachlich_geprueft: 1, rechnerisch_geprueft: 1, freigegeben: 2, bezahlt: 3 }[status] ?? 0;
  return (
    <ol className="schrittfolge">
      {SCHRITTE.map(([k, t], i) => (
        <li key={k} className={i < stufe || stufe === 3 ? "erledigt" : i === stufe ? "aktuell" : undefined}>
          <span>{i < stufe || stufe === 3 ? "✓" : i + 1}</span> {t}
        </li>
      ))}
    </ol>
  );
}
