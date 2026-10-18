import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import type { Kostenkontrolle } from "@/lib/typen";
import { Abweichung } from "../../../kosten/Abweichung";

export const dynamic = "force-dynamic";

export default async function KostenreportSeite({ params, searchParams }: { params: Promise<{ projektId: string }>; searchParams: Promise<{ alle?: string }> }) {
  const { projektId } = await params;
  const { alle } = await searchParams;
  const d = await api<Kostenkontrolle & { projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null } }>(`/auswertungen/kostenreport/${projektId}`);
  const sichtbar = alle ? d.gewerke : d.gewerke.filter((g) => Number(g.stand.geschaetzt) || g.vertraege.length);
  const gruppen = [...new Set(sichtbar.map((g) => g.gruppe ?? "Ohne Gruppe"))];
  const n = (v: string) => (Number(v) ? deZahl(v) : "");
  return (
    <Bericht
      titel={`Kostenreport ${d.projekt.nr} ${d.projekt.suchcode}`}
      untertitel={[d.projekt.strasse, [d.projekt.plz, d.projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
      stand={new Date().toISOString().slice(0, 10)}
      excel={`/auswertungen/excel/kostenreport/${projektId}`}
      zurueck="Kostenreport"
      filter={
        <form className="filterleiste">
          <label className="haken">
            <input type="checkbox" name="alle" value="1" defaultChecked={!!alle} /> auch Gewerke ohne Schätzung und Vergabe
          </label>
          <button type="submit" className="zweitrangig">
            Anzeigen
          </button>
        </form>
      }
    >
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng">
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Gewerk / Vertragspartner</th>
              <th className="num">geschätzt</th>
              <th className="num">vergeben</th>
              <th className="num">Nachträge</th>
              <th className="num">Summe vergeben</th>
              <th className="num">berechnet</th>
              <th className="num">bezahlt</th>
              <th className="num">Abweichung</th>
            </tr>
          </thead>
          {gruppen.map((gr) => (
            <tbody key={gr}>
              <tr className="gruppenzeile">
                <td colSpan={9}>{gr}</td>
              </tr>
              {sichtbar
                .filter((g) => (g.gruppe ?? "Ohne Gruppe") === gr)
                .map((g) => (
                  <tr key={g.id}>
                    <td className="num">{g.nr}</td>
                    <td>
                      {g.bezeichnung}
                      {g.vertraege.length ? <div className="hint">{[...new Set(g.vertraege.map((v) => v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode))].join(", ")}</div> : null}
                    </td>
                    <td className="num">{n(g.stand.geschaetzt)}</td>
                    <td className="num">{n(g.stand.vergeben)}</td>
                    <td className="num">{n(g.stand.nachtraege)}</td>
                    <td className="num">{n(g.stand.summeVergeben)}</td>
                    <td className="num">{n(g.stand.berechnet)}</td>
                    <td className="num">{n(g.stand.bezahlt)}</td>
                    <td className="num">
                      <Abweichung wert={g.stand.abweichung} />
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="summenzeile">
              <td />
              <td>
                <b>Summe Projekt</b>
              </td>
              <td className="num">{deZahl(d.summe.geschaetzt)}</td>
              <td className="num">{deZahl(d.summe.vergeben)}</td>
              <td className="num">{deZahl(d.summe.nachtraege)}</td>
              <td className="num">{deZahl(d.summe.summeVergeben)}</td>
              <td className="num">{deZahl(d.summe.berechnet)}</td>
              <td className="num">{deZahl(d.summe.bezahlt)}</td>
              <td className="num">
                <Abweichung wert={d.summe.abweichung} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">Abweichung = geschätzt − Trend (Vergabe inkl. beauftragter Nachträge, sonst Schätzung). Bezahlt = abgegolten inkl. Skonto und Bauabzugsteuer.</p>
    </Bericht>
  );
}
