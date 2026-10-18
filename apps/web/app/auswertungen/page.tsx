import { BarChart3, ClipboardList, FileText, LineChart, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjektListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function Auswertungen() {
  const projekte = await api<ProjektListe[]>("/projekte?abgeschlossen=alle");
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Auswertungen</h1>
          <p className="untertitel">Am Bildschirm, als PDF (Drucken) oder als Excel-Datei</p>
        </div>
      </div>
      <div className="kachelraster auswertungskacheln">
        <a href="/auswertungen/liquiditaet" className="projektkachel">
          <Wallet size={22} />
          <div className="kacheltitel">Liquiditätsbetrachtung</div>
          <div className="kachelzeile">Erlöse, Kosten und Saldo je Projekt und Gesellschaft – Trend, angefordert, bezahlt, offen</div>
        </a>
        <a href="/auswertungen/liquiditaetsplan" className="projektkachel">
          <LineChart size={22} />
          <div className="kacheltitel">Liquiditätsplan</div>
          <div className="kachelzeile">Erwartete Ein- und Auszahlungen nach Kalenderwochen aus Bauzeitenplan, Raten und Gewerken – mit Bestand und Tiefststand</div>
        </a>
        <a href="/auswertungen/controlling" className="projektkachel">
          <BarChart3 size={22} />
          <div className="kacheltitel">Controlling-Übersicht</div>
          <div className="kachelzeile">Kosten, Verkauf und Ertrag: geschätzt gegen Trend, mit Abweichung und Stand</div>
        </a>
      </div>
      <h2>Je Projekt</h2>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Projekt</th>
              <th>Gesellschaft</th>
              <th>Berichte</th>
            </tr>
          </thead>
          <tbody>
            {projekte.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.nr}</td>
                <td>
                  {p.suchcode} {p.abgeschlossen ? <span className="badge klein">abgeschlossen</span> : null}
                </td>
                <td>{p.gesellschaft}</td>
                <td className="berichtlinks">
                  <a href={`/auswertungen/projektbericht/${p.id}`}>
                    <FileText size={14} /> Projektbericht
                  </a>
                  <a href={`/auswertungen/kostenreport/${p.id}`}>
                    <ClipboardList size={14} /> Kostenreport
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
