import { PROJEKTART_TEXT } from "@bt/domain";
import { Building2, MapPin, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjektListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function Projekte({ searchParams }: { searchParams: Promise<{ suche?: string; status?: string }> }) {
  const { suche = "", status = "laufend" } = await searchParams;
  const q = new URLSearchParams({ ...(suche && { suche }), abgeschlossen: status === "laufend" ? "nein" : status === "abgeschlossen" ? "ja" : "alle" });
  let projekte: ProjektListe[] = [];
  let fehler: string | undefined;
  try {
    projekte = await api<ProjektListe[]>(`/projekte?${q}`);
  } catch {
    fehler = "API nicht erreichbar – läuft `pnpm dev:api`?";
  }
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Projekte</h1>
          <p className="untertitel">{projekte.length} {status === "abgeschlossen" ? "abgeschlossene" : status === "alle" ? "" : "laufende"} Projekte</p>
        </div>
        <a className="knopf" href="/projekte/neu">
          <Plus size={16} /> Neues Projekt
        </a>
      </div>
      <form className="filterleiste">
        <div className="suchfeld">
          <Search size={16} />
          <input name="suche" defaultValue={suche} placeholder="Suchcode, Ort, Straße oder Nr." />
        </div>
        <div className="segment">
          {[
            ["laufend", "Laufend"],
            ["abgeschlossen", "Abgeschlossen"],
            ["alle", "Alle"],
          ].map(([w, t]) => (
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
      {fehler ? <div className="fehler">{fehler}</div> : null}
      <div className="kachelraster">
        {projekte.map((p) => (
          <a key={p.id} href={`/projekte/${p.id}`} className="projektkachel">
            <div className="kachelkopf">
              <span className="projektnr">{p.nr}</span>
              {p.abgeschlossen ? <span className="badge">abgeschlossen</span> : <span className="badge gut">laufend</span>}
            </div>
            <div className="kacheltitel">{p.suchcode}</div>
            <div className="kachelzeile">
              <MapPin size={14} /> {[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}
            </div>
            <div className="kachelzeile">
              <Building2 size={14} /> {p.gesellschaft}
            </div>
            <div className="kachelfuss">
              <span>{PROJEKTART_TEXT[p.art as keyof typeof PROJEKTART_TEXT] ?? p.art}</span>
              <span>{p.einheiten} Einheiten</span>
            </div>
          </a>
        ))}
      </div>
      {!fehler && !projekte.length && <p className="leer">Keine Projekte gefunden.</p>}
    </>
  );
}
