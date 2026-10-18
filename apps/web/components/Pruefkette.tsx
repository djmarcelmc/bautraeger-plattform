import { deZahl } from "@/lib/format";

const ZEILEN: [string, string, "start" | "abzug" | "summe"][] = [
  ["geprueftKumuliert", "Geprüfte Leistung (kumuliert)", "start"],
  ["nachlass", "Nachlass", "abzug"],
  ["umlagen", "Umlagen", "abzug"],
  ["einbehalt", "Sicherheitseinbehalt", "abzug"],
  ["anspruchKumuliert", "Anspruch kumuliert", "summe"],
  ["bisherAbgegolten", "bisher abgegolten", "abzug"],
  ["faellig", "Fälliger Betrag", "summe"],
  ["skonto", "Skonto", "abzug"],
  ["bauabzugsteuer", "Bauabzugsteuer (§ 48 EStG)", "abzug"],
  ["auszahlung", "Auszahlung", "summe"],
];

/** Prüfkette einer Handwerkerrechnung, wahlweise mit zwei Spalten (ohne/mit Skonto). */
export function Pruefkette({ spalten }: { spalten: { titel: string; werte: Record<string, string>; hervorheben?: boolean }[] }) {
  return (
    <table className="pruefkette">
      <thead>
        <tr>
          <th />
          {spalten.map((s) => (
            <th key={s.titel} className={`num${s.hervorheben ? " aktiv" : ""}`}>
              {s.titel}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ZEILEN.map(([k, t, art]) => (
          <tr key={k} className={art}>
            <td>
              {art === "abzug" ? "− " : art === "summe" ? "= " : ""}
              {t}
            </td>
            {spalten.map((s) => (
              <td key={s.titel} className={`num${s.hervorheben ? " aktiv" : ""}`}>
                {deZahl(s.werte[k])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
