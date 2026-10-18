import { AlertTriangle } from "lucide-react";
import type { BudgetStand, GewerkZeile } from "@/lib/typen";

/** Kleines Kennzeichen „Budget 106 %“ in der Kostentabelle. */
export function BudgetBadge({ b }: { b: BudgetStand }) {
  return (
    <span className={`badge klein ${b.stufe === "ueber" ? "gefahr" : "warnung"}`} title={b.text ?? undefined}>
      Budget {b.auslastungProzent !== null ? `${b.auslastungProzent} %` : "fehlt"}
    </span>
  );
}

/** Zusammenfassung über der Kostentabelle, wenn Gewerke die Budgetschwelle erreichen. */
export function BudgetHinweis({ gewerke, schwelle }: { gewerke: GewerkZeile[]; schwelle: number }) {
  const ueber = gewerke.filter((g) => g.budget.stufe === "ueber").length;
  const nahe = gewerke.filter((g) => g.budget.stufe === "nahe").length;
  if (!ueber && !nahe) return null;
  const teile = [ueber ? `${ueber} ${ueber === 1 ? "Gewerk" : "Gewerke"} über Budget` : null, nahe ? `${nahe} ab ${schwelle} % gebunden` : null].filter(Boolean);
  return (
    <div className={`budget-hinweis${ueber ? " ueber" : ""}`}>
      <AlertTriangle size={16} />
      <span>
        <b>{teile.join(", ")}</b> – gebunden = Auftrag inkl. beauftragter Nachträge bzw. der höhere geprüfte Rechnungsstand.{" "}
        <a href="/einstellungen#kosten">Schwelle ändern</a>
      </span>
    </div>
  );
}

/** Hinweis auf der Gewerkseite. */
export function BudgetHinweisGewerk({ b }: { b: BudgetStand }) {
  if (!b.text) return null;
  return (
    <div className={`budget-hinweis${b.stufe === "ueber" ? " ueber" : ""}`}>
      <AlertTriangle size={16} />
      <span>{b.text}</span>
    </div>
  );
}
