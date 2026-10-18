import { AlertTriangle, Plus, Search } from "lucide-react";
import { Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { mahnlauf } from "./aktionen";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { KaufvertragListe, MahnPosten, OffenerPosten } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function Verkauf({ searchParams }: { searchParams: Promise<{ reiter?: string; suche?: string; stichtag?: string }> }) {
  const { reiter = "vertraege", suche = "", stichtag } = await searchParams;
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
        <a href="?reiter=mahnwesen" className={reiter === "mahnwesen" ? "aktiv" : undefined}>
          Mahnwesen{ueberfaellig.length ? ` (${ueberfaellig.length})` : ""}
        </a>
      </nav>
      {reiter === "mahnwesen" ? <Mahnwesen stichtag={stichtag} /> : null}
      {reiter === "mahnwesen" ? null : reiter === "vertraege" ? (
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

const STUFE_TEXT = ["", "Zahlungserinnerung", "Mahnung", "Letzte Mahnung"];

async function Mahnwesen({ stichtag }: { stichtag?: string }) {
  const heute = new Date().toISOString().slice(0, 10);
  const tag = stichtag ?? heute;
  const posten = await api<MahnPosten[]>(`/mahnwesen/vorschlag?stichtag=${tag}`);
  const faellig = posten.filter((p) => p.vorschlag.stufe);
  return (
    <>
      <form className="filterleiste">
        <input type="hidden" name="reiter" value="mahnwesen" />
        <label>
          <span>Stichtag</span>
          <input type="date" name="stichtag" defaultValue={tag} />
        </label>
        <button type="submit" className="zweitrangig">
          Neu berechnen
        </button>
        <p className="hint">
          Erinnerung {3} Tage nach Fälligkeit, danach je 7 Tage Frist. Verzugszinsen tagesgenau ab dem Tag nach Fälligkeit (Basiszins + 5 bzw. 9 Prozentpunkte).
        </p>
      </form>
      <Formular aktion={mahnlauf} knopf={faellig.length ? `${faellig.length} Mahnung(en) erstellen und drucken` : null}>
        <div className="karte ohne-innenabstand">
          <table>
            <thead>
              <tr>
                <th />
                <th>Rechnung</th>
                <th>Vertrag / Empfänger</th>
                <th>fällig</th>
                <th className="num">offen €</th>
                <th className="num">Zinsen bis Stichtag €</th>
                <th>bisher</th>
                <th>Vorschlag</th>
              </tr>
            </thead>
            <tbody>
              {posten.map((p) => (
                <tr key={p.id} className={p.vorschlag.stufe ? "hervorgehoben" : undefined}>
                  <td>{p.vorschlag.stufe ? <input type="checkbox" name="posten" value={p.id} defaultChecked aria-label={`${p.rechnungsnr} mahnen`} /> : null}</td>
                  <td>
                    <a href={`/zahlungsanforderungen/${p.id}`}>{p.rechnungsnr}</a>
                  </td>
                  <td>
                    <a href={`/kaufvertraege/${p.vertrag.id}?reiter=zahlungen`}>{p.vertrag.nr}</a> <span className="hint">· {p.empfaenger}</span>
                  </td>
                  <td>
                    {deDatum(p.faelligAm)} <span className="hint">({p.tageUeberfaellig} T)</span>
                  </td>
                  <td className="num">{deZahl(p.offen)}</td>
                  <td className="num">{p.zinsHinweis ? <span className="badge warnung" title={p.zinsHinweis}>Basiszins fehlt</span> : deZahl(p.verzugszinsen)}</td>
                  <td>{p.mahnstufe ? <span className="badge">{STUFE_TEXT[p.mahnstufe]}</span> : <span className="hint">–</span>}</td>
                  <td>
                    {p.vorschlag.stufe ? (
                      <span className="badge gefahr">{STUFE_TEXT[p.vorschlag.stufe]}</span>
                    ) : (
                      <span className="hint">{p.vorschlag.hinweis ?? "–"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!posten.length && <p className="leer">Keine überfälligen Zahlungsanforderungen zum Stichtag.</p>}
        </div>
        {faellig.length ? (
          <div className="raster">
            <Feld label="Mahndatum" name="datum" typ="date" wert={tag} pflicht />
            <Feld label="Mahngebühr € (ab 2. Stufe)" name="mahngebuehr" zahl hinweis="Bei Verbrauchern nur tatsächliche Kosten" />
          </div>
        ) : null}
      </Formular>
    </>
  );
}
