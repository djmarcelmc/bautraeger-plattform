import { ArrowRight, Building2, CheckCircle2, Circle, FolderKanban, Home, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Gesellschaft, Partner, ProjektListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function Uebersicht() {
  let daten: { g: Gesellschaft[]; p: ProjektListe[]; k: Partner[] } | undefined;
  try {
    const [g, p, k] = await Promise.all([
      api<Gesellschaft[]>("/gesellschaften"),
      api<ProjektListe[]>("/projekte?abgeschlossen=nein"),
      api<Partner[]>("/partner"),
    ]);
    daten = { g, p, k };
  } catch {
    daten = undefined;
  }
  if (!daten)
    return (
      <>
        <h1>Übersicht</h1>
        <div className="fehler">API nicht erreichbar – läuft `pnpm dev:api`?</div>
      </>
    );
  const { g, p, k } = daten;
  const einheiten = p.reduce((s, x) => s + x.einheiten, 0);
  const schritte = [
    { fertig: g.length > 0, text: "Gesellschaft mit DATEV-Daten anlegen", href: "/gesellschaften" },
    { fertig: p.length > 0, text: "Erstes Projekt anlegen", href: "/projekte/neu" },
    { fertig: einheiten > 0, text: "Einheiten und Stellplätze erfassen", href: p[0] ? `/projekte/${p[0].id}` : "/projekte" },
    { fertig: k.length > 0, text: "Geschäftspartner (Käufer, Handwerker) anlegen", href: "/partner/neu" },
  ];
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Übersicht</h1>
          <p className="untertitel">Willkommen auf der Bauträger-Plattform</p>
        </div>
      </div>
      <div className="kpis">
        <a className="kpi" href="/projekte">
          <span>
            <FolderKanban size={16} /> Laufende Projekte
          </span>
          <b>{p.length}</b>
        </a>
        <div className="kpi">
          <span>
            <Home size={16} /> Einheiten
          </span>
          <b>{einheiten}</b>
        </div>
        <a className="kpi" href="/partner">
          <span>
            <Users size={16} /> Geschäftspartner
          </span>
          <b>{k.length}</b>
        </a>
        <a className="kpi" href="/gesellschaften">
          <span>
            <Building2 size={16} /> Gesellschaften
          </span>
          <b>{g.length}</b>
        </a>
      </div>
      <div className="zweispaltig">
        <section className="karte">
          <h2>{schritte.every((s) => s.fertig) ? "Grundeinrichtung abgeschlossen" : "Erste Schritte"}</h2>
          <ul className="schritte">
            {schritte.map((s) => (
              <li key={s.text} className={s.fertig ? "fertig" : undefined}>
                {s.fertig ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                <a href={s.href}>{s.text}</a>
              </li>
            ))}
          </ul>
        </section>
        <section className="karte">
          <h2>Laufende Projekte</h2>
          {p.length ? (
            <ul className="liste">
              {p.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <a href={`/projekte/${x.id}`}>
                    <span className="projektnr">{x.nr}</span> {x.suchcode}
                    <small>{x.ort}</small>
                    <ArrowRight size={14} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Noch keine Projekte.</p>
          )}
        </section>
      </div>
    </>
  );
}
