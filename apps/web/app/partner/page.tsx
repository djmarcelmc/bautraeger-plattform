import { Plus, Search, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import { partnerName, type Partner } from "@/lib/typen";
import { ROLLEN_TEXT } from "./PartnerFelder";

export const dynamic = "force-dynamic";

export default async function PartnerListe({ searchParams }: { searchParams: Promise<{ suche?: string; rolle?: string }> }) {
  const { suche = "", rolle = "" } = await searchParams;
  const q = new URLSearchParams({ ...(suche && { suche }), ...(rolle && { rolle }) });
  const liste = await api<Partner[]>(`/partner?${q}`);
  const heute = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Geschäftspartner</h1>
          <p className="untertitel">Kunden, Interessenten, Handwerker, Notare und weitere Partner</p>
        </div>
        <div className="knopfleiste">
          <a className="knopf zweitrangig" href="/einstellungen/import?art=partner">
            <Upload size={16} /> Importieren
          </a>
          <a className="knopf" href="/partner/neu">
            <Plus size={16} /> Neuer Partner
          </a>
        </div>
      </div>
      <form className="filterleiste">
        <div className="suchfeld">
          <Search size={16} />
          <input name="suche" defaultValue={suche} placeholder="Suchcode, Name, Ort oder Nr." />
        </div>
        <select name="rolle" defaultValue={rolle}>
          <option value="">Alle Rollen</option>
          {Object.entries(ROLLEN_TEXT).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" className="zweitrangig">
          Filtern
        </button>
      </form>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Suchcode</th>
              <th>Name</th>
              <th>Ort</th>
              <th>Rollen</th>
              <th>Freistellung</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((p) => (
              <tr key={p.id} className="klickbar">
                <td className="num">{p.nr}</td>
                <td>
                  <a href={`/partner/${p.id}`} className="zeilenlink">
                    {p.suchcode}
                  </a>
                </td>
                <td>{partnerName(p)}</td>
                <td>{[p.plz, p.ort].filter(Boolean).join(" ")}</td>
                <td>
                  {p.rollen.map((r) => (
                    <span key={r} className={`badge rolle-${r}`}>
                      {ROLLEN_TEXT[r] ?? r}
                    </span>
                  ))}
                </td>
                <td>
                  {p.rollen.includes("handwerker") ? (
                    p.freistellungGueltigBis && p.freistellungGueltigBis >= heute ? (
                      <span className="badge gut">bis {deDatum(p.freistellungGueltigBis)}</span>
                    ) : (
                      <span className="badge warnung">fehlt / abgelaufen</span>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p className="leer">Keine Geschäftspartner gefunden.</p>}
      </div>
    </>
  );
}
