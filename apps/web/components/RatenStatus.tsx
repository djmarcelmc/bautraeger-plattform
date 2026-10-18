const TEXT: Record<string, [string, string]> = {
  offen: ["Bauabschnitt offen", ""],
  gesperrt: ["Voraussetzung fehlt", "warnung"],
  anforderbar: ["anforderbar", "akzent"],
  angefordert: ["angefordert", "info"],
  teilbezahlt: ["teilweise bezahlt", "warnung"],
  bezahlt: ["bezahlt", "gut"],
};

export function RatenStatus({ status }: { status: string }) {
  const [t, k] = TEXT[status] ?? [status, ""];
  return <span className={`badge ${k}`}>{t}</span>;
}
