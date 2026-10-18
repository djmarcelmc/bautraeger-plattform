import { Camera, Plus, Search } from "lucide-react";
import { MangelStatus } from "@/components/MangelStatus";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import type { MangelListe, ProjektListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

const STATUS = [
  ["offen", "Offen"],
  ["ueberfaellig", "Frist überschritten"],
  ["erledigt", "Erledigt"],
  ["alle", "Alle"],
] as const;

export default async function Maengel({ searchParams }: { searchParams: Promise<{ status?: string; projekt?: string; suche?: string; handwerker?: string }> }) {
  const { status = "offen", projekt = "", suche = "", handwerker = "" } = await searchParams;
  const q = new URLSearchParams({ status, ...(projekt && { projektId: projekt }), ...(suche && { suche }), ...(handwerker && { handwerkerId: handwerker }) });
  const [liste, offen, projekte] = await Promise.all([
    api<MangelListe[]>(`/maengel?${q}`),
    api<MangelListe[]>(`/maengel?status=offen${projekt ? `&projektId=${projekt}` : ""}`),
    api<ProjektListe[]>("/projekte?abgeschlossen=alle"),
  ]);
  const zahl = (s: string) => offen.filter((m) => m.status === s).length;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Mängel</h1>
          <p className="untertitel">Erfassung mit Fotos, Rügen mit Fristen, Erledigung</p>
        </div>
        <a className="knopf" href={`/maengel/neu${projekt ? `?projekt=${projekt}` : ""}`}>
          <Plus size={16} /> Mangel erfassen
        </a>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Offen</span>
          <b>{offen.length}</b>
          <small>{offen.filter((m) => m.einbehalt).length} mit Einbehalt</small>
        </div>
        <div className="kpi">
          <span>Noch nicht gerügt</span>
          <b>{zahl("neu")}</b>
        </div>
        <div className="kpi">
          <span>Frist läuft</span>
          <b>{zahl("frist_laeuft")}</b>
        </div>
        <a className={`kpi${zahl("ueberfaellig") ? " kpi-warnung" : ""}`} href="?status=ueberfaellig">
          <span>Frist überschritten</span>
          <b>{zahl("ueberfaellig")}</b>
          <small>nächste Rüge oder Ersatzvornahme</small>
        </a>
      </div>
      <form className="filterleiste">
        <div className="suchfeld">
          <Search size={16} />
          <input name="suche" defaultValue={suche} placeholder="Mangel, Beschreibung oder Ort" />
        </div>
        <select name="projekt" defaultValue={projekt}>
          <option value="">Alle Projekte</option>
          {projekte.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nr} {p.suchcode}
            </option>
          ))}
        </select>
        <div className="segment">
          {STATUS.map(([w, t]) => (
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
              <th>Nr.</th>
              <th>Mangel</th>
              <th>Einheit</th>
              <th>Gewerk / Handwerker</th>
              <th>Festgestellt</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((m) => (
              <tr key={m.id} className="klickbar">
                <td>
                  <span className="projektnr">{m.projektNr}</span> {m.nr}
                </td>
                <td>
                  <a href={`/maengel/${m.id}`} className="zeilenlink">
                    {m.titel}
                  </a>
                  <div className="hint">
                    {[m.ort, m.eigentum === "gemeinschaft" ? "Gemeinschaftseigentum" : null].filter(Boolean).join(" · ")}
                    {m.fotos ? (
                      <span className="fotozahl">
                        <Camera size={12} /> {m.fotos}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{m.einheit ?? "–"}</td>
                <td>
                  {m.gewerk ?? "–"}
                  {m.handwerker ? <div className="hint">{m.handwerker}</div> : null}
                </td>
                <td>{deDatum(m.festgestelltAm)}</td>
                <td>
                  <MangelStatus status={m.status} fristBis={m.fristBis} />
                  {m.ruegen ? <div className="hint">{m.ruegen}. Rüge</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p className="leer">Keine Mängel in dieser Ansicht.</p>}
      </div>
    </>
  );
}
