import { AlertTriangle, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { KaufvertragListe, OffenerPosten } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function Verkauf({ searchParams }: { searchParams: Promise<{ reiter?: string; suche?: string }> }) {
  const { reiter = "vertraege", suche = "" } = await searchParams;
  const [vertraege, op] = await Promise.all([
    api<KaufvertragListe[]>(`/kaufvertraege${suche ? `?suche=${encodeURIComponent(suche)}` : ""}`),
    api<OffenerPosten[]>("/offene-posten"),
  ]);
  const s = (f: (v: KaufvertragListe) => string) => vertraege.reduce((a, v) => a + Number(f(v)), 0);
  const volumen = s((v) => v.vertragssumme);
  const angefordert = s((v) => v.angefordert);
  const bezahlt = s((v) => v.bezahlt);
  const ueberfaellig = op.filter((o) => o.tageUeberfaellig > 0);
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Verkauf</h1>
          <p className="untertitel">Kaufverträge, Zahlungsanforderungen und offene Posten</p>
        </div>
        <a className="knopf" href="/kaufvertraege/neu">
          <Plus size={16} /> Neuer Kaufvertrag
        </a>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Vertragsvolumen</span>
          <b>{deZahl(volumen, 0)} €</b>
          <small>{vertraege.length} Kaufverträge</small>
        </div>
        <div className="kpi">
          <span>Angefordert</span>
          <b>{deZahl(angefordert, 0)} €</b>
          <div className="balken">
            <div style={{ width: `${volumen ? (angefordert / volumen) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span>Bezahlt</span>
          <b>{deZahl(bezahlt, 0)} €</b>
          <small>{angefordert ? Math.round((bezahlt / angefordert) * 100) : 0} % des Angeforderten</small>
        </div>
        <a className={`kpi${ueberfaellig.length ? " kpi-warnung" : ""}`} href="?reiter=op">
          <span>{ueberfaellig.length ? <AlertTriangle size={16} /> : null} Offene Posten</span>
          <b>{deZahl(op.reduce((a, o) => a + Number(o.offen), 0), 0)} €</b>
          <small>{ueberfaellig.length ? `${ueberfaellig.length} überfällig` : "nichts überfällig"}</small>
        </a>
      </div>
      <nav className="reiter">
        <a href="?reiter=vertraege" className={reiter === "vertraege" ? "aktiv" : undefined}>
          Kaufverträge ({vertraege.length})
        </a>
        <a href="?reiter=op" className={reiter === "op" ? "aktiv" : undefined}>
          Offene Posten ({op.length})
        </a>
      </nav>
      {reiter === "vertraege" ? (
        <>
          <form className="filterleiste">
            <div className="suchfeld">
              <Search size={16} />
              <input name="suche" defaultValue={suche} placeholder="Vertrags-Nr., Urkunde oder Käufer" />
            </div>
            <button type="submit" className="zweitrangig">
              Suchen
            </button>
          </form>
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th>Vertrag</th>
                  <th>Projekt</th>
                  <th>Käufer</th>
                  <th>Einheiten</th>
                  <th className="num">Vertragssumme €</th>
                  <th>Zahlungsstand</th>
                </tr>
              </thead>
              <tbody>
                {vertraege.map((v) => {
                  const anteilA = Number(v.vertragssumme) ? (Number(v.angefordert) / Number(v.vertragssumme)) * 100 : 0;
                  const anteilB = Number(v.vertragssumme) ? (Number(v.bezahlt) / Number(v.vertragssumme)) * 100 : 0;
                  return (
                    <tr key={v.id} className="klickbar">
                      <td>
                        <a href={`/kaufvertraege/${v.id}`} className="zeilenlink">
                          {v.nr}
                        </a>
                        <div className="hint">{v.datum ? `vom ${deDatum(v.datum)}` : ""}</div>
                      </td>
                      <td>
                        <span className="projektnr">{v.projektNr}</span> {v.projekt}
                      </td>
                      <td>{v.kaeufer}</td>
                      <td>{v.einheiten}</td>
                      <td className="num">{deZahl(v.vertragssumme)}</td>
                      <td className="stand">
                        <div className="balken doppelt" title={`angefordert ${Math.round(anteilA)} %, bezahlt ${Math.round(anteilB)} %`}>
                          <div className="angefordert" style={{ width: `${anteilA}%` }} />
                          <div style={{ width: `${anteilB}%` }} />
                        </div>
                        <small>
                          {Math.round(anteilB)} % bezahlt · {Math.round(anteilA)} % angefordert
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!vertraege.length && <p className="leer">Noch keine Kaufverträge.</p>}
          </div>
        </>
      ) : (
        <div className="karte ohne-innenabstand">
          <table>
            <thead>
              <tr>
                <th>Rechnung</th>
                <th>Vertrag</th>
                <th>Empfänger</th>
                <th>Fällig</th>
                <th className="num">Betrag €</th>
                <th className="num">Offen €</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {op.map((o) => (
                <tr key={o.id} className="klickbar">
                  <td>
                    <a href={`/zahlungsanforderungen/${o.id}`} className="zeilenlink">
                      {o.rechnungsnr}
                    </a>
                  </td>
                  <td>
                    {o.kaufvertrag} <span className="hint">· {o.projekt}</span>
                  </td>
                  <td>{o.empfaenger}</td>
                  <td>{deDatum(o.faelligAm)}</td>
                  <td className="num">{deZahl(o.betrag)}</td>
                  <td className="num">
                    <b>{deZahl(o.offen)}</b>
                  </td>
                  <td>
                    {o.tageUeberfaellig > 0 ? (
                      <span className="badge gefahr">{o.tageUeberfaellig} Tage überfällig</span>
                    ) : (
                      <span className="badge info">offen</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!op.length && <p className="leer">Keine offenen Posten.</p>}
        </div>
      )}
    </>
  );
}
