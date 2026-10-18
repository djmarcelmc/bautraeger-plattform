import { EINHEIT_TYP_TEXT, MABV_ABSCHNITTE, PROJEKTART_TEXT } from "@bt/domain";
import { Building2, CalendarDays, MapPin, Plus } from "lucide-react";
import { Dokumente } from "@/components/Dokumente";
import { Auswahl, Feld, Gruppe, Haken, Protokoll } from "@/components/Felder";
import { MeldungZuruecknehmen } from "@/components/MeldungZuruecknehmen";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Gesellschaft, KaufvertragListe, Kostenkontrolle, MangelListe, ProjektDetail, ProtokollEintrag } from "@/lib/typen";
import { MangelStatus } from "@/components/MangelStatus";
import { Abweichung } from "../../kosten/Abweichung";
import { gewerkAnlegen, gewerkeplanAnlegen } from "../../kosten/aktionen";
import { bautenstandMelden, bautenstandZuruecknehmen, sammelanforderung } from "../../verkauf/aktionen";
import { EinheitFelder } from "../../einheiten/EinheitFelder";
import { einheitAnlegen, projektAendern, projektKopieren } from "../aktionen";
import { ProjektFelder } from "../ProjektFelder";
import { AbnahmenReiter } from "./Abnahmen";
import { BauzeitReiter } from "./Bauzeitenplan";

export const dynamic = "force-dynamic";

const PLURAL: Record<string, [string, string]> = {
  wohnung: ["Wohnung", "Wohnungen"],
  stellplatz: ["Stellplatz", "Stellplätze"],
  gewerbe: ["Gewerbeeinheit", "Gewerbeeinheiten"],
  hobbyraum: ["Hobbyraum", "Hobbyräume"],
  sonstiges: ["Sonstige", "Sonstige"],
};

const KURZ: Record<string, string> = {
  erdarbeiten: "Erdarb.",
  rohbau: "Rohbau",
  dach: "Dach",
  heizung: "Heizung",
  sanitaer: "Sanitär",
  elektro: "Elektro",
  fenster: "Fenster",
  innenputz: "Putz",
  estrich: "Estrich",
  fliesen: "Fliesen",
  bezugsfertigkeit: "Bezug",
  fassade: "Fassade",
  fertigstellung: "Fertig",
};

const REITER = [
  ["einheiten", "Einheiten"],
  ["verkauf", "Verkauf"],
  ["bautenstand", "Bautenstand"],
  ["bauzeit", "Bauzeitenplan"],
  ["kosten", "Kosten"],
  ["maengel", "Mängel"],
  ["abnahmen", "Abnahmen"],
  ["dokumente", "Dokumente"],
  ["stammdaten", "Stammdaten"],
  ["kopieren", "Projekt kopieren"],
  ["protokoll", "Änderungsprotokoll"],
] as const;

export default async function ProjektSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reiter?: string; nurVergeben?: string }>;
}) {
  const { id } = await params;
  const { reiter = "einheiten", nurVergeben } = await searchParams;
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
          <a className="badge akzent" href={`/auswertungen/projektbericht/${p.id}`}>
            Projektbericht
          </a>
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

      {reiter === "verkauf" && <VerkaufReiter projektId={id} />}
      {reiter === "bautenstand" && <BautenstandReiter projektId={id} />}
      {reiter === "bauzeit" && <BauzeitReiter projektId={id} baubeginnSoll={p.baubeginnSoll} />}
      {reiter === "maengel" && <MaengelReiter projektId={id} />}
      {reiter === "abnahmen" && <AbnahmenReiter projektId={id} />}
      {reiter === "kosten" && <KostenReiter projektId={id} nurVergeben={nurVergeben === "1"} />}
      {reiter === "dokumente" && <Dokumente objektTyp="projekt" objektId={id} pfad={`/projekte/${id}`} />}
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

async function VerkaufReiter({ projektId }: { projektId: string }) {
  const vertraege = await api<KaufvertragListe[]>(`/kaufvertraege?projektId=${projektId}`);
  return (
    <>
      <div className="aktionen" style={{ marginBottom: 12 }}>
        <a className="knopf" href={`/kaufvertraege/neu?projekt=${projektId}`}>
          <Plus size={16} /> Neuer Kaufvertrag
        </a>
      </div>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Vertrag</th>
              <th>Käufer</th>
              <th>Einheiten</th>
              <th className="num">Vertragssumme €</th>
              <th className="num">Angefordert €</th>
              <th className="num">Bezahlt €</th>
            </tr>
          </thead>
          <tbody>
            {vertraege.map((v) => (
              <tr key={v.id} className="klickbar">
                <td>
                  <a href={`/kaufvertraege/${v.id}`} className="zeilenlink">
                    {v.nr}
                  </a>
                </td>
                <td>{v.kaeufer}</td>
                <td>{v.einheiten}</td>
                <td className="num">{deZahl(v.vertragssumme)}</td>
                <td className="num">{deZahl(v.angefordert)}</td>
                <td className="num">{deZahl(v.bezahlt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!vertraege.length && <p className="leer">Noch keine Kaufverträge in diesem Projekt.</p>}
      </div>
    </>
  );
}

async function BautenstandReiter({ projektId }: { projektId: string }) {
  const { einheiten, meldungen } = await api<{
    einheiten: { id: string; nr: string; typ: string; bauabschnitt: number | null }[];
    meldungen: { id: string; einheitId: string; abschnitt: string; fertigAm: string }[];
  }>(`/projekte/${projektId}/bautenstand`);
  const heute = new Date().toISOString().slice(0, 10);
  if (!einheiten.length) return <p className="leer">Noch keine Einheiten angelegt.</p>;
  return (
    <>
      <Formular aktion={bautenstandMelden.bind(null, projektId)} knopf="Fertig melden">
        <div className="karte ohne-innenabstand">
          <table className="bautenstand">
            <thead>
              <tr>
                <th />
                <th>Einheit</th>
                {MABV_ABSCHNITTE.map((a) => (
                  <th key={a.key} title={a.bezeichnung}>
                    {KURZ[a.key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {einheiten.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input type="checkbox" name="einheit" value={e.id} aria-label={`Einheit ${e.nr} auswählen`} />
                  </td>
                  <td>
                    <b>{e.nr}</b>
                    <div className="hint">{EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT]}</div>
                  </td>
                  {MABV_ABSCHNITTE.map((a) => {
                    const m = meldungen.find((x) => x.einheitId === e.id && x.abschnitt === a.key);
                    return (
                      <td key={a.key} className="zellentd">
                        {m ? (
                          <MeldungZuruecknehmen aktion={bautenstandZuruecknehmen.bind(null, projektId, m.id)} datum={deDatum(m.fertigAm)} titel={`${e.nr}: ${KURZ[a.key]}`} />
                        ) : (
                          <span className="zelle" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="raster">
          <Auswahl label="Bauabschnitt" name="abschnitt" pflicht optionen={MABV_ABSCHNITTE.map((a) => ({ wert: a.key, text: a.bezeichnung }))} />
          <Feld label="Fertig am" name="fertigAm" typ="date" wert={heute} pflicht />
          <p className="hint breit">Einheiten links anhaken, Abschnitt wählen und fertig melden. Stellplätze laufen bei der Ratenfreigabe mit der Wohnung mit.</p>
        </div>
      </Formular>
      <h2>Raten anfordern</h2>
      <Formular aktion={sammelanforderung.bind(null, projektId)} knopf="Alle anforderbaren Raten anfordern" bestaetigen="Für alle Kaufverträge dieses Projekts die anforderbaren Raten anfordern?">
        <div className="karte">
          <div className="raster">
            <Feld label="Datum der Anforderung" name="datum" typ="date" wert={heute} pflicht />
            <p className="hint breit">Erstellt je Kaufvertrag eine Zahlungsanforderung über alle Raten, deren Bauabschnitt gemeldet und deren Voraussetzungen erfüllt sind.</p>
          </div>
        </div>
      </Formular>
    </>
  );
}

async function KostenReiter({ projektId, nurVergeben }: { projektId: string; nurVergeben: boolean }) {
  const k = await api<Kostenkontrolle>(`/projekte/${projektId}/kosten`);
  if (!k.gewerke.length)
    return (
      <div className="zweispaltig">
        <section className="karte">
          <h2>Gewerkeplan aus Vorlage</h2>
          <p className="hint">Legt 65 Gewerke (DIN-276-Gruppen) an und verteilt das Budget nach den Standardanteilen. Alles ist danach anpassbar.</p>
          <Formular aktion={gewerkeplanAnlegen.bind(null, projektId)} knopf="Gewerkeplan anlegen" className="formular">
            <Feld label="Gesamtbudget brutto €" name="budgetBrutto" zahl pflicht />
          </Formular>
        </section>
        <section className="karte">
          <h2>Einzelnes Gewerk</h2>
          <Formular aktion={gewerkAnlegen.bind(null, projektId)} knopf="Gewerk anlegen" className="formular">
            <div className="raster">
              <Feld label="Nr." name="nr" zahl pflicht />
              <Feld label="Bezeichnung" name="bezeichnung" pflicht />
              <Feld label="Geschätzt brutto €" name="geschaetztBrutto" zahl />
            </div>
          </Formular>
        </section>
      </div>
    );
  const s = k.summe;
  const sichtbar = nurVergeben ? k.gewerke.filter((g) => g.vertraege.length) : k.gewerke;
  const gruppen = [...new Set(sichtbar.map((g) => g.gruppe ?? "Ohne Gruppe"))];
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <span>Geschätzt</span>
          <b>{deZahl(s.geschaetzt, 0)} €</b>
          <small>{k.gewerke.length} Gewerke</small>
        </div>
        <div className="kpi">
          <span>Vergeben inkl. Nachträge</span>
          <b>{deZahl(s.summeVergeben, 0)} €</b>
          <small>Trend {deZahl(s.trend, 0)} €</small>
        </div>
        <div className="kpi">
          <span>Berechnet / bezahlt</span>
          <b>{deZahl(s.berechnet, 0)} €</b>
          <small>abgegolten {deZahl(s.bezahlt, 0)} €</small>
        </div>
        <div className={`kpi${Number(s.abweichung) < 0 ? " kpi-warnung" : ""}`}>
          <span>Abweichung</span>
          <b>
            <Abweichung wert={s.abweichung} /> €
          </b>
          <small>{Number(s.abweichung) >= 0 ? "Einsparung gegenüber Schätzung" : "Mehrkosten gegenüber Schätzung"}</small>
        </div>
      </div>
      <div className="segment" style={{ marginBottom: 12 }}>
        <a href="?reiter=kosten" className={nurVergeben ? undefined : "aktiv"}>
          Alle Gewerke ({k.gewerke.length})
        </a>
        <a href="?reiter=kosten&nurVergeben=1" className={nurVergeben ? "aktiv" : undefined}>
          Nur vergebene ({k.gewerke.filter((g) => g.vertraege.length).length})
        </a>
      </div>
      <div className="karte ohne-innenabstand">
        <table className="kostentabelle">
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Gewerk / Vertragspartner</th>
              <th className="num">geschätzt</th>
              <th className="num">vergeben</th>
              <th className="num">Nachträge</th>
              <th className="num">berechnet</th>
              <th className="num">bezahlt</th>
              <th className="num">Abweichung</th>
            </tr>
          </thead>
          {gruppen.map((gr) => (
            <tbody key={gr}>
              <tr className="gruppenzeile">
                <td colSpan={8}>{gr}</td>
              </tr>
              {sichtbar
                .filter((g) => (g.gruppe ?? "Ohne Gruppe") === gr)
                .map((g) => (
                  <tr key={g.id} className="klickbar">
                    <td className="num">{g.nr}</td>
                    <td>
                      <a href={`/gewerke/${g.id}?projekt=${projektId}`} className="zeilenlink">
                        {g.bezeichnung}
                      </a>
                      {g.vertraege.length ? (
                        <div className="hint">
                          {g.vertraege.map((v) => v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode).join(", ")}
                          {g.vertraege.some((v) => v.offeneRechnungen) ? <span className="badge warnung klein">Rechnung offen</span> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="num">{deZahl(g.stand.geschaetzt)}</td>
                    <td className="num">{Number(g.stand.vergeben) ? deZahl(g.stand.vergeben) : ""}</td>
                    <td className="num">{Number(g.stand.nachtraege) ? deZahl(g.stand.nachtraege) : ""}</td>
                    <td className="num">{Number(g.stand.berechnet) ? deZahl(g.stand.berechnet) : ""}</td>
                    <td className="num">{Number(g.stand.bezahlt) ? deZahl(g.stand.bezahlt) : ""}</td>
                    <td className="num">
                      <Abweichung wert={g.stand.abweichung} />
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td />
              <td>
                <b>Summe</b>
              </td>
              <td className="num">
                <b>{deZahl(s.geschaetzt)}</b>
              </td>
              <td className="num">{deZahl(s.vergeben)}</td>
              <td className="num">{deZahl(s.nachtraege)}</td>
              <td className="num">{deZahl(s.berechnet)}</td>
              <td className="num">{deZahl(s.bezahlt)}</td>
              <td className="num">
                <b>
                  <Abweichung wert={s.abweichung} />
                </b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <details className="karte">
        <summary>Weiteres Gewerk anlegen</summary>
        <Formular aktion={gewerkAnlegen.bind(null, projektId)} knopf="Gewerk anlegen" className="formular">
          <div className="raster">
            <Feld label="Nr." name="nr" zahl pflicht />
            <Feld label="Bezeichnung" name="bezeichnung" pflicht />
            <Feld label="Gewerkegruppe" name="gruppe" />
            <Feld label="Geschätzt brutto €" name="geschaetztBrutto" zahl />
          </div>
        </Formular>
      </details>
    </>
  );
}

async function MaengelReiter({ projektId }: { projektId: string }) {
  const liste = await api<MangelListe[]>(`/maengel?projektId=${projektId}&status=alle`);
  return (
    <>
      <div className="aktionen" style={{ marginBottom: 12 }}>
        <a className="knopf" href={`/maengel/neu?projekt=${projektId}`}>
          <Plus size={16} /> Mangel erfassen
        </a>
      </div>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Mangel</th>
              <th>Einheit</th>
              <th>Handwerker</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((m) => (
              <tr key={m.id} className="klickbar">
                <td className="num">{m.nr}</td>
                <td>
                  <a href={`/maengel/${m.id}`} className="zeilenlink">
                    {m.titel}
                  </a>
                  {m.ort ? <div className="hint">{m.ort}</div> : null}
                </td>
                <td>{m.einheit ?? "–"}</td>
                <td>{m.handwerker ?? "–"}</td>
                <td>
                  <MangelStatus status={m.status} fristBis={m.fristBis} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p className="leer">Keine Mängel erfasst.</p>}
      </div>
    </>
  );
}
