import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import { GesellschaftFilter, filterQuery } from "../Filter";

export const dynamic = "force-dynamic";

type Block = { trend: string; angefordert: string; bezahlt: string; offen: string };
type Zeile = { erloese: Block; kosten: Block; saldo: Block };
interface Liquiditaet {
  gesellschaften: { gesellschaft: { id: string; nr: number; name: string; anschrift: string | null }; projekte: (Zeile & { projekt: { id: string; nr: number; suchcode: string } })[]; summe: Zeile }[];
  gesamt: Zeile;
  stand: string;
}

const Zahl = ({ v }: { v: string }) => <td className={`num${Number(v) < 0 ? " minus" : ""}`}>{deZahl(v)}</td>;

function Bloecke({ name, z, summe }: { name: React.ReactNode; z: Zeile; summe?: boolean }) {
  return (
    <>
      {(
        [
          ["erloese", "Erlöse"],
          ["kosten", "− Kosten"],
          ["saldo", "= Saldo"],
        ] as const
      ).map(([k, t], i) => (
        <tr key={k} className={`${k === "saldo" ? "saldozeile" : ""}${summe ? " summenzeile" : ""}`}>
          <td>{i === 0 ? name : ""}</td>
          <td>{t}</td>
          <Zahl v={z[k].trend} />
          <Zahl v={z[k].angefordert} />
          <Zahl v={z[k].bezahlt} />
          <Zahl v={z[k].offen} />
        </tr>
      ))}
    </>
  );
}

export default async function LiquiditaetSeite({ searchParams }: { searchParams: Promise<{ gesellschaft?: string; projekte?: string }> }) {
  const { gesellschaft, projekte } = await searchParams;
  const q = filterQuery(gesellschaft, projekte);
  const d = await api<Liquiditaet>(`/auswertungen/liquiditaet?${q}`);
  return (
    <Bericht titel="Liquiditätsbetrachtung" stand={d.stand} excel={`/auswertungen/excel/liquiditaet?${q}`} zurueck="Liquidität" filter={<GesellschaftFilter gesellschaft={gesellschaft} projekte={projekte} />}>
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle">
          <thead>
            <tr>
              <th>Projekt</th>
              <th />
              <th className="num">Trend</th>
              <th className="num">Angefordert</th>
              <th className="num">Bezahlt</th>
              <th className="num">Offen</th>
            </tr>
          </thead>
          {d.gesellschaften.map((g) => (
            <tbody key={g.gesellschaft.id}>
              <tr className="gruppenzeile">
                <td colSpan={6}>
                  {g.gesellschaft.name}
                  {g.gesellschaft.anschrift ? ` · ${g.gesellschaft.anschrift}` : ""}
                </td>
              </tr>
              {g.projekte.map((p) => (
                <Bloecke
                  key={p.projekt.id}
                  name={
                    <a href={`/auswertungen/projektbericht/${p.projekt.id}`}>
                      <span className="projektnr">{p.projekt.nr}</span> {p.projekt.suchcode}
                    </a>
                  }
                  z={p}
                />
              ))}
              {d.gesellschaften.length > 1 ? <Bloecke name={<b>Summe {g.gesellschaft.name}</b>} z={g.summe} summe /> : null}
            </tbody>
          ))}
          <tbody>
            <Bloecke name={<b>Gesamt</b>} z={d.gesamt} summe />
          </tbody>
        </table>
        {!d.gesellschaften.length && <p className="leer">Keine Projekte.</p>}
      </div>
      <p className="hint">
        Erlöse: Trend = verkaufte Einheiten zum Vertragspreis + unverkaufte zum Listenpreis; angefordert/bezahlt aus Zahlungsanforderungen und -eingängen. Kosten: Trend = Vergabe inkl.
        beauftragter Nachträge (sonst Schätzung); angefordert = geprüfte Rechnungen; bezahlt = Auszahlungen inkl. abgeführter Bauabzugsteuer; offen = geprüft, aber noch nicht abgegolten (inkl.
        Einbehalte).
      </p>
    </Bericht>
  );
}
