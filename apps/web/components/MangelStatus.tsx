import { deDatum } from "@/lib/format";

const TEXT: Record<string, [string, string]> = {
  neu: ["nicht gerügt", "warnung"],
  frist_laeuft: ["Frist läuft", "info"],
  ueberfaellig: ["Frist überschritten", "gefahr"],
  erledigt: ["erledigt", "gut"],
};

export function MangelStatus({ status, fristBis }: { status: string; fristBis?: string | null }) {
  const [t, k] = TEXT[status] ?? [status, ""];
  return (
    <span className={`badge ${k}`}>
      {t}
      {fristBis && status !== "erledigt" ? ` · ${deDatum(fristBis)}` : ""}
    </span>
  );
}
