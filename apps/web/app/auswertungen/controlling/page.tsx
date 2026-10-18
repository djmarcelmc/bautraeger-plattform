import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import { Abweichung } from "../../kosten/Abweichung";
import { GesellschaftFilter, filterQuery } from "../Filter";

export const dynamic = "force-dynamic";

type Werte = {
  kosten: { standProzent: string; geschaetzt: string; trend: string; abweichung: string };
  verkauf: { standProzent: string; geschaetzt: string; trend: string; abweichung: string };
  ertrag: { geschaetzt: string; trend: string; abweichung: string };
};
interface Controlling {
  projekte: (Werte & { projekt: { id: string; nr: number; suchcode: string }; gesellschaft: { name: string } })[];
  gesamt: Werte;
  stand: string;
}

function Zeile({ name, w, summe }: { name: React.ReactNode; w: Werte; summe?: boolean }) {
  return (
    <tr className={summe ? "summenzeile" : undefined}>
      <td>{name}</td>
      <td className="num">
        <span className="stand">
          <span style={{ width: `${Math.min(100, Number(w.kosten.standProzent))}%` }} />
        </span>
        {deZahl(w.kosten.standProzent, 1)} %
      </td>
      <td className="num">{deZahl(w.kosten.geschaetzt, 0)}</td>
      <td className="num">{deZahl(w.kosten.trend, 0)}</td>
      <td className="num">
        <Abweichung wert={w.kosten.abweichung} stellen={0} />
      </td>
      <td className="num trenner">{deZahl(w.verkauf.standProzent, 1)} %</td>
      <td className="num">{deZahl(w.verkauf.geschaetzt, 0)}</td>
      <td className="num">{deZahl(w.verkauf.trend, 0)}</td>
      <td className="num">
        <Abweichung wert={w.verkauf.abweichung} stellen={0} />
      </td>
      <td className="num trenner">{deZahl(w.ertrag.geschaetzt, 0)}</td>
      <td className="num">
        <b>{deZahl(w.ertrag.trend, 0)}</b>
      </td>
      <td className="num">
        <Abweichung wert={w.ertrag.abweichung} stellen={0} />
      </td>
    </tr>
  );
}

export default async function ControllingSeite({ searchParams }: { searchParams: Promise<{ gesellschaft?: string; projekte?: string }> }) {
  const { gesellschaft, projekte } = await searchParams;
  const q = filterQuery(gesellschaft, projekte);
  const d = await api<Controlling>(`/auswertungen/controlling?${q}`);
  return (
    <Bericht titel="Controlling-Übersicht" stand={d.stand} excel={`/auswertungen/excel/controlling?${q}`} zurueck="Controlling" filter={<GesellschaftFilter gesellschaft={gesellschaft} projekte={projekte} />}>
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng">
          <thead>
            <tr className="obergruppe">
              <th />
              <th colSpan={4}>Kosten</th>
              <th colSpan={4} className="trenner">
                Verkauf
              </th>
              <th colSpan={3} className="trenner">
                Ertrag
              </th>
            </tr>
            <tr>
              <th>Projekt</th>
              <th className="num">Abrechnung</th>
              <th className="num">geschätzt</th>
              <th className="num">Trend</th>
              <th className="num">Abw.</th>
              <th className="num trenner">verkauft</th>
              <th className="num">geschätzt</th>
              <th className="num">Trend</th>
              <th className="num">Abw.</th>
              <th className="num trenner">geschätzt</th>
              <th className="num">Trend</th>
              <th className="num">Abw.</th>
            </tr>
          </thead>
          <tbody>
            {d.projekte.map((p) => (
              <Zeile
                key={p.projekt.id}
                name={
                  <a href={`/auswertungen/projektbericht/${p.projekt.id}`}>
                    <span className="projektnr">{p.projekt.nr}</span> {p.projekt.suchcode}
                  </a>
                }
                w={p}
              />
            ))}
          </tbody>
          <tfoot>
            <Zeile name={<b>Gesamt</b>} w={d.gesamt} summe />
          </tfoot>
        </table>
        {!d.projekte.length && <p className="leer">Keine Projekte.</p>}
      </div>
      <p className="hint">
        Abrechnung = geprüfte Rechnungen im Verhältnis zu den Trendkosten. Verkauft = Anteil verkaufter Einheiten am Listenwert. Abweichung: positiv = günstiger als geschätzt (Kosten) bzw. besser
        (Verkauf, Ertrag).
      </p>
    </Bericht>
  );
}
