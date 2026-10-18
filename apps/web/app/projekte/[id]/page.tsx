import { EINHEIT_TYP_TEXT, PROJEKTART_TEXT } from "@bt/domain";
import { Building2, CalendarDays, MapPin } from "lucide-react";
import { Feld, Gruppe, Haken, Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Gesellschaft, ProjektDetail, ProtokollEintrag } from "@/lib/typen";
import { EinheitFelder } from "../../einheiten/EinheitFelder";
import { einheitAnlegen, projektAendern, projektKopieren } from "../aktionen";
import { ProjektFelder } from "../ProjektFelder";

export const dynamic = "force-dynamic";

const PLURAL: Record<string, [string, string]> = {
  wohnung: ["Wohnung", "Wohnungen"],
  stellplatz: ["Stellplatz", "Stellplätze"],
  gewerbe: ["Gewerbeeinheit", "Gewerbeeinheiten"],
  hobbyraum: ["Hobbyraum", "Hobbyräume"],
  sonstiges: ["Sonstige", "Sonstige"],
};

const REITER = [
  ["einheiten", "Einheiten"],
  ["stammdaten", "Stammdaten"],
  ["kopieren", "Projekt kopieren"],
  ["protokoll", "Änderungsprotokoll"],
] as const;

export default async function ProjektSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reiter?: string }>;
}) {
  const { id } = await params;
  const { reiter = "einheiten" } = await searchParams;
  const p = await api<ProjektDetail>(`/projekte/${id}`);
  const summeVk = p.einheiten.reduce((s, e) => s + Number(e.vkBrutto ?? 0), 0);
  const verkauft = p.einheiten.filter((e) => e.verkauft).length;
  const nrVon = new Map(p.einheiten.map((e) => [e.id, e.nr]));

  return (
    <>
      <p className="brotkrumen">
        <a href="/projekte">Projekte</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>
            <span className="projektnr gross">{p.nr}</span> {p.suchcode}
          </h1>
          <div className="metazeile">
            <span>
              <MapPin size={14} /> {[p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "keine Adresse"}
            </span>
            <span>
              <Building2 size={14} /> {p.gesellschaft.name}
            </span>
            {p.baubeginnSoll || p.baubeginnIst ? (
              <span>
                <CalendarDays size={14} /> Baubeginn {deDatum(p.baubeginnIst ?? p.baubeginnSoll)}
                {p.baubeginnIst ? "" : " (Soll)"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="badges">
          <span className="badge">{PROJEKTART_TEXT[p.art as keyof typeof PROJEKTART_TEXT]}</span>
          {p.para13bAnwendbar ? <span className="badge">§ 13b</span> : null}
          {p.abgeschlossen ? <span className="badge">abgeschlossen</span> : <span className="badge gut">laufend</span>}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Einheiten</span>
          <b>{p.einheiten.length}</b>
          <small>
            {Object.entries(p.uebersicht)
              .map(([t, u]) => `${u.anzahl} ${PLURAL[t]?.[u.anzahl === 1 ? 0 : 1] ?? t}`)
              .join(" · ") || "noch keine"}
          </small>
        </div>
        <div className="kpi">
          <span>Verkauft</span>
          <b>
            {verkauft} / {p.einheiten.length}
          </b>
          <div className="balken">
            <div style={{ width: `${p.einheiten.length ? (verkauft / p.einheiten.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span>Verkaufsvolumen brutto</span>
          <b>{deZahl(summeVk, 0)} €</b>
          <small>Summe Listenpreise</small>
        </div>
        <div className="kpi">
          <span>Kostenstelle</span>
          <b>{p.kostenstelle ?? p.nr}</b>
          <small>DATEV KOST1</small>
        </div>
      </div>

      <nav className="reiter">
        {REITER.map(([k, t]) => (
          <a key={k} href={`?reiter=${k}`} className={reiter === k ? "aktiv" : undefined}>
            {t}
          </a>
        ))}
      </nav>

      {reiter === "einheiten" && (
        <>
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Typ</th>
                  <th className="num">BA</th>
                  <th>Etage</th>
                  <th>Art</th>
                  <th className="num">Fläche m²</th>
                  <th className="num">VK brutto €</th>
                  <th>Zugehörig zu</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.einheiten.map((e) => (
                  <tr key={e.id} className="klickbar">
                    <td>
                      <a href={`/einheiten/${e.id}`} className="zeilenlink">
                        {e.nr}
                      </a>
                    </td>
                    <td>{EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ}</td>
                    <td className="num">{e.bauabschnitt}</td>
                    <td>{e.etage}</td>
                    <td>{e.art}</td>
                    <td className="num">{deZahl(e.wohnflaeche)}</td>
                    <td className="num">{deZahl(e.vkBrutto)}</td>
                    <td>{e.zugehoerigZuEinheitId ? nrVon.get(e.zugehoerigZuEinheitId) : ""}</td>
                    <td>{e.verkauft ? <span className="badge info">verkauft</span> : <span className="badge gut">frei</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!p.einheiten.length && <p className="leer">Noch keine Einheiten – unten die erste anlegen.</p>}
          </div>
          <h2>Einheit hinzufügen</h2>
          <Formular aktion={einheitAnlegen.bind(null, id)} knopf="Einheit anlegen">
            <EinheitFelder andere={p.einheiten} />
          </Formular>
        </>
      )}

      {reiter === "stammdaten" && <Stammdaten p={p} />}

      {reiter === "kopieren" && (
        <Formular aktion={projektKopieren.bind(null, id)} knopf="Kopie erstellen">
          <Gruppe titel="Neues Projekt">
            <Feld label="Projekt-Nr." name="nr" pflicht zahl />
            <Feld label="Suchcode" name="suchcode" wert={`${p.suchcode}-KOPIE`} pflicht />
          </Gruppe>
          <Gruppe titel="Kopieroptionen">
            <div className="haken-reihe breit">
              <Haken label={`Einheiten kopieren (${p.einheiten.length})`} name="einheitenKopieren" wert />
              <Haken label="Gewerke mit Schätzkosten kopieren" name="gewerkeKopieren" />
            </div>
          </Gruppe>
        </Formular>
      )}

      {reiter === "protokoll" && <ProtokollReiter id={id} />}
    </>
  );
}

async function Stammdaten({ p }: { p: ProjektDetail }) {
  const gesellschaften = await api<Gesellschaft[]>("/gesellschaften");
  return (
    <Formular aktion={projektAendern.bind(null, p.id)}>
      <ProjektFelder p={p} gesellschaften={gesellschaften} />
    </Formular>
  );
}

async function ProtokollReiter({ id }: { id: string }) {
  const eintraege = await api<ProtokollEintrag[]>(`/protokoll/${id}`);
  return (
    <div className="karte">
      <Protokoll eintraege={eintraege} />
    </div>
  );
}
