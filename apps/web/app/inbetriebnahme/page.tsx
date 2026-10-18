import type { PruefGruppe, PruefStatus } from "@bt/domain";
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import { EinstellungenReiter } from "../einstellungen/Reiter";

export const dynamic = "force-dynamic";

interface Ergebnis {
  stichtag: string;
  gruppen: PruefGruppe[];
  fortschritt: { ok: number; gesamt: number; prozent: number };
}

const SYMBOL: Record<PruefStatus, typeof CircleCheck> = { ok: CircleCheck, warnung: CircleAlert, fehlt: CircleX, info: CircleDashed };
const STATUSTEXT: Record<PruefStatus, string> = { ok: "erledigt", warnung: "prüfen", fehlt: "offen", info: "Hinweis" };

/** Inbetriebnahme-Assistent: prüft die Checkliste aus docs/inbetriebnahme.md live gegen den Datenstand. */
export default async function Inbetriebnahme() {
  const d = await api<Ergebnis>("/inbetriebnahme");
  const zaehle = (s: PruefStatus) => d.gruppen.flatMap((g) => g.punkte).filter((p) => p.status === s).length;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Inbetriebnahme</h1>
          <p className="untertitel">Checkliste für den Start – live geprüft gegen die erfassten Daten, Stand {deDatum(d.stichtag)}.</p>
        </div>
      </div>
      <EinstellungenReiter aktiv="inbetriebnahme" />

      <section className="karte ib-fortschritt">
        <div className="ib-zahl">
          <strong>{d.fortschritt.prozent} %</strong>
          <span className="hint">
            {d.fortschritt.ok} von {d.fortschritt.gesamt} Punkten erledigt
          </span>
        </div>
        <div className="ib-balken" role="progressbar" aria-valuenow={d.fortschritt.prozent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${d.fortschritt.prozent}%` }} />
        </div>
        <div className="ib-legende">
          <span className="ib-status fehlt">
            <CircleX size={15} /> {zaehle("fehlt")} offen
          </span>
          <span className="ib-status warnung">
            <CircleAlert size={15} /> {zaehle("warnung")} prüfen
          </span>
          <span className="ib-status ok">
            <CircleCheck size={15} /> {zaehle("ok")} erledigt
          </span>
          <span className="ib-status info">
            <CircleDashed size={15} /> {zaehle("info")} Hinweise
          </span>
        </div>
      </section>

      <div className="ib-raster">
        {d.gruppen.map((g) => {
          const offen = g.punkte.filter((p) => p.status === "fehlt" || p.status === "warnung").length;
          return (
            <section key={g.titel} className="karte ib-gruppe">
              <div className="ib-kopf">
                <h2>{g.titel}</h2>
                {offen ? <span className="badge warnung">{offen} offen</span> : <span className="badge gut">erledigt</span>}
              </div>
              <ul className="ib-liste">
                {g.punkte.map((p) => {
                  const Symbol = SYMBOL[p.status];
                  const inhalt = (
                    <>
                      <span className={`ib-status ${p.status}`} title={STATUSTEXT[p.status]}>
                        <Symbol size={18} />
                      </span>
                      <span className="ib-text">
                        <strong>{p.titel}</strong>
                        <span>{p.text}</span>
                      </span>
                      {p.link ? <ArrowRight size={15} className="ib-pfeil" /> : null}
                    </>
                  );
                  return (
                    <li key={p.schluessel} className={p.status}>
                      {p.link ? <a href={p.link}>{inhalt}</a> : <div>{inhalt}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="hint">Ausführliche Anleitung zu jedem Schritt: docs/inbetriebnahme.md im Repository.</p>
    </>
  );
}
