import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import type { Gesellschaft } from "@/lib/typen";
import { gesellschaftAnlegen } from "./aktionen";
import { GesellschaftFelder } from "./GesellschaftFelder";

export const dynamic = "force-dynamic";

export default async function Gesellschaften() {
  const liste = await api<Gesellschaft[]>("/gesellschaften");
  const vorschlag = Math.max(0, ...liste.map((g) => g.nr)) + 1;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Gesellschaften</h1>
          <p className="untertitel">Rechtsträger der Projekte mit DATEV-Zuordnung</p>
        </div>
      </div>
      {liste.length ? (
        <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Name</th>
              <th className="num">DATEV Berater/Mandant</th>
              <th>SKR</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((g) => (
              <tr key={g.id}>
                <td className="num">{g.nr}</td>
                <td>
                  <a href={`/gesellschaften/${g.id}`}>{g.name}</a>
                </td>
                <td className="num">{g.datevBeraternr ? `${g.datevBeraternr} / ${g.datevMandantennr ?? "–"}` : "–"}</td>
                <td>{g.skr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="hint">Noch keine Gesellschaft angelegt. Lege zuerst eine an – Projekte gehören immer zu einer Gesellschaft.</p>
      )}
      <h2>Neue Gesellschaft</h2>
      <Formular aktion={gesellschaftAnlegen} knopf="Anlegen">
        <GesellschaftFelder vorschlagNr={vorschlag} />
      </Formular>
    </>
  );
}
