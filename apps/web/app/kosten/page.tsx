import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { RechnungsbuchZeile } from "@/lib/typen";
import { RechnungStatus } from "@/components/RechnungStatus";

export const dynamic = "force-dynamic";

const REITER = [
  ["pruefen", "Zu prüfen", "erfasst"],
  ["freigeben", "Freizugeben", "sachlich_geprueft,rechnerisch_geprueft"],
  ["zahlen", "Zu zahlen", "freigegeben"],
  ["bezahlt", "Bezahlt", "bezahlt"],
] as const;

export default async function Kosten({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  const { reiter = "pruefen" } = await searchParams;
  const alle = await api<RechnungsbuchZeile[]>("/eingangsrechnungen");
  const gruppe = (stati: string) => alle.filter((r) => stati.split(",").includes(r.status));
  const aktiv = REITER.find(([k]) => k === reiter) ?? REITER[0];
  const liste = gruppe(aktiv[2]);
  const betrag = (r: RechnungsbuchZeile) => Number(r.status === "bezahlt" ? r.auszahlung : (r.geprueftKumuliert ?? r.betragBrutto));
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Kosten</h1>
          <p className="untertitel">Rechnungseingangsbuch: prüfen → freigeben → zahlen. Gewerke und Verträge pflegst du im Projekt unter „Kosten“.</p>
        </div>
      </div>
      <div className="kpis">
        {REITER.map(([k, t, stati]) => {
          const g = gruppe(stati);
          return (
            <a key={k} href={`?reiter=${k}`} className={`kpi${k === reiter ? " kpi-aktiv" : ""}`}>
              <span>{t}</span>
              <b>{g.length}</b>
              <small>{k === "bezahlt" ? `${deZahl(g.reduce((s, r) => s + Number(r.auszahlung ?? 0), 0), 0)} € ausgezahlt` : `${deZahl(g.reduce((s, r) => s + Number(r.geprueftKumuliert ?? r.betragBrutto), 0), 0)} € (kum.)`}</small>
            </a>
          );
        })}
      </div>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Rechnung</th>
              <th>Handwerker</th>
              <th>Projekt / Gewerk</th>
              <th>Eingang</th>
              <th className="num">{aktiv[0] === "bezahlt" ? "Auszahlung €" : "Betrag (kum.) €"}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((r) => (
              <tr key={r.id} className="klickbar">
                <td>
                  <a href={`/eingangsrechnungen/${r.id}`} className="zeilenlink">
                    {r.rechnungsnr}
                  </a>
                  {r.schlussrechnung ? <span className="badge klein">SR</span> : null}
                </td>
                <td>{r.handwerker}</td>
                <td>
                  <span className="projektnr">{r.projektNr}</span> {r.gewerkNr} {r.gewerk}
                </td>
                <td>{deDatum(r.eingangAm)}</td>
                <td className="num">{deZahl(betrag(r))}</td>
                <td>
                  <RechnungStatus status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p className="leer">Keine Rechnungen in diesem Schritt.</p>}
      </div>
    </>
  );
}
