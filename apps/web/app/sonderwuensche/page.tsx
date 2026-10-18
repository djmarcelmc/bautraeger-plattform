import { SONDERWUNSCH_STATUS_TEXT } from "@bt/domain";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { ProjektListe, Sonderwunsch } from "@/lib/typen";

export const dynamic = "force-dynamic";

interface Liste {
  sonderwuensche: (Sonderwunsch & { vertrag: { id: string; nr: string }; projekt: { id: string; nr: number; suchcode: string }; abgelaufen: boolean })[];
  summen: { angebote: string; beauftragt: string; zusatzleistungen: string; gutschriften: string; marge: string | null; offeneAngebote: number };
}

const FILTER = [
  ["", "Alle"],
  ["angebot", "Angebote"],
  ["beauftragt", "Beauftragt"],
  ["abgelehnt", "Abgelehnt"],
] as const;
const STATUS_KLASSE = { angebot: "info", beauftragt: "gut", abgelehnt: "" } as const;

export default async function SonderwuenscheUebersicht({ searchParams }: { searchParams: Promise<{ projekt?: string; status?: string }> }) {
  const { projekt = "", status = "" } = await searchParams;
  const q = new URLSearchParams({ ...(projekt ? { projektId: projekt } : {}), ...(status ? { status } : {}) });
  const [d, projekte] = await Promise.all([api<Liste>(`/sonderwuensche?${q}`), api<ProjektListe[]>("/projekte")]);
  return (
    <>
      <p className="brotkrumen">
        <a href="/verkauf">Verkauf</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>Sonderwünsche</h1>
          <p className="untertitel">Zusatzleistungen und Gutschriften aller Kaufverträge – neue Angebote im Kaufvertrag unter „Sonderwünsche“</p>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>offene Angebote</span>
          <b>{d.summen.offeneAngebote}</b>
          <small>Volumen {deZahl(d.summen.angebote, 0)} €</small>
        </div>
        <div className="kpi">
          <span>beauftragt (Saldo)</span>
          <b>{deZahl(d.summen.beauftragt, 0)} €</b>
          <small>
            + {deZahl(d.summen.zusatzleistungen, 0)} € / − {deZahl(d.summen.gutschriften, 0)} €
          </small>
        </div>
        <div className="kpi">
          <span>Marge</span>
          <b>{d.summen.marge !== null ? `${deZahl(d.summen.marge, 0)} €` : "–"}</b>
          <small>wo Handwerkerkosten erfasst sind</small>
        </div>
      </div>
      <form className="filterleiste">
        <select name="projekt" defaultValue={projekt}>
          <option value="">Alle Projekte</option>
          {projekte.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nr} {p.suchcode}
            </option>
          ))}
        </select>
        <div className="segment">
          {FILTER.map(([w, t]) => (
            <label key={w}>
              <input type="radio" name="status" value={w} defaultChecked={status === w} />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <button type="submit" className="zweitrangig">
          Filtern
        </button>
      </form>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Projekt</th>
              <th>Kaufvertrag</th>
              <th className="num">Nr.</th>
              <th>Leistung</th>
              <th className="num">Preis €</th>
              <th className="num">Marge €</th>
              <th>Stand</th>
            </tr>
          </thead>
          <tbody>
            {d.sonderwuensche.map((s) => {
              const g = s.art === "gutschrift";
              const marge = s.kostenBrutto !== null ? (Number(s.betragBrutto) - Number(s.kostenBrutto)) * (g ? -1 : 1) : null;
              return (
                <tr key={s.id}>
                  <td>
                    {s.projekt.nr} {s.projekt.suchcode}
                  </td>
                  <td>
                    <a href={`/kaufvertraege/${s.vertrag.id}?reiter=sonderwuensche`}>{s.vertrag.nr}</a>
                  </td>
                  <td className="num">{s.nr}</td>
                  <td>
                    <a href={`/sonderwuensche/${s.id}`}>{s.bezeichnung}</a>
                    {g ? <span className="badge warnung klein">Gutschrift</span> : null}
                  </td>
                  <td className={`num${g ? " minus" : ""}`}>
                    {g ? "−" : ""}
                    {deZahl(s.betragBrutto)}
                  </td>
                  <td className="num">{marge !== null ? deZahl(marge) : ""}</td>
                  <td>
                    <span className={`badge ${STATUS_KLASSE[s.status]}`}>{SONDERWUNSCH_STATUS_TEXT[s.status]}</span>
                    {s.abgelaufen ? <span className="badge warnung">abgelaufen</span> : null}
                    <div className="hint">{s.status === "angebot" ? (s.gueltigBis ? `gültig bis ${deDatum(s.gueltigBis)}` : `vom ${deDatum(s.angebotAm)}`) : deDatum(s.entschiedenAm)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!d.sonderwuensche.length && <p className="leer">Keine Sonderwünsche für diese Auswahl.</p>}
      </div>
    </>
  );
}
