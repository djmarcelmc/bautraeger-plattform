import { AlertTriangle, BadgeCheck, Camera, Printer } from "lucide-react";
import { Feld, Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { MangelStatus } from "@/components/MangelStatus";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type DokumentInfo, type Kostenkontrolle, type MangelDetail, type ProjektDetail, type ProtokollEintrag } from "@/lib/typen";
import { dokumentAusblenden } from "../../dokumente/aktionen";
import { erledigen, fotosAnhaengen, mangelAendern, ruegen, wiedereroeffnen } from "../aktionen";
import { MangelFelder } from "../MangelFelder";

export const dynamic = "force-dynamic";

export default async function MangelSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await api<MangelDetail>(`/maengel/${id}`);
  const [dokumente, projekt, kosten, protokoll] = await Promise.all([
    api<DokumentInfo[]>(`/dokumente?objektTyp=mangel&objektId=${id}`),
    api<ProjektDetail>(`/projekte/${m.projektId}`),
    api<Kostenkontrolle>(`/projekte/${m.projektId}/kosten`),
    api<ProtokollEintrag[]>(`/protokoll/${id}`),
  ]);
  const fotos = dokumente.filter((d) => d.mimeType?.startsWith("image/"));
  const andere = dokumente.filter((d) => !d.mimeType?.startsWith("image/"));
  const heute = new Date().toISOString().slice(0, 10);
  const pfad = `/maengel/${id}`;
  const letzte = m.ruegen.at(-1);

  return (
    <>
      <p className="brotkrumen">
        <a href="/maengel">Mängel</a> › <a href={`/projekte/${m.projekt.id}?reiter=maengel`}>{m.projekt.nr} {m.projekt.suchcode}</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>
            <span className="projektnr gross">{m.nr}</span> {m.titel}
          </h1>
          <div className="metazeile">
            {m.ort ? <span>{m.ort}</span> : null}
            {m.einheit ? <span>Einheit {m.einheit.nr}</span> : null}
            <span>{m.eigentum === "gemeinschaft" ? "Gemeinschaftseigentum" : "Sondereigentum"}</span>
            <span>
              festgestellt {deDatum(m.festgestelltAm)}
              {m.festgestelltDurch ? ` (${m.festgestelltDurch})` : ""}
            </span>
          </div>
        </div>
        <div className="badges">
          {m.mangelart ? <span className="badge">{m.mangelart}</span> : null}
          <MangelStatus status={m.status} fristBis={letzte ? (letzte.nachfristBis ?? letzte.fristBis) : null} />
        </div>
      </div>

      <div className="zweispaltig rechnung">
        <div>
          <section className="karte">
            {fotos.length ? (
              <div className="galerie">
                {fotos.map((f) => (
                  <a key={f.id} href={`/dokumente/${f.id}`} target="_blank" rel="noreferrer" title={f.dateiname}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/dokumente/${f.id}`} alt={f.beschreibung ?? f.dateiname} loading="lazy" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="leer">
                <Camera size={16} /> Noch keine Fotos.
              </p>
            )}
            <Formular aktion={fotosAnhaengen.bind(null, id)} knopf="Fotos hinzufügen" knopfArt="zweitrangig" zuruecksetzen className="formular upload">
              <div className="uploadfeld">
                <input type="file" name="fotos" accept="image/*,application/pdf" capture="environment" multiple required />
              </div>
            </Formular>
            {m.beschreibung ? <p className="beschreibung">{m.beschreibung}</p> : null}
            {andere.length ? (
              <ul className="dokliste kompakt">
                {andere.map((d) => (
                  <li key={d.id}>
                    <a href={`/dokumente/${d.id}`} target="_blank" rel="noreferrer" className="dokname">
                      {d.dateiname}
                    </a>
                    <Formular aktion={dokumentAusblenden.bind(null, d.id, pfad)} knopf="Ausblenden" knopfArt="zweitrangig" className="inline" bestaetigen={`„${d.dateiname}“ ausblenden?`} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="karte">
            <h2>Rügen an den Handwerker</h2>
            {m.ruegen.length ? (
              <ol className="zeitleiste">
                {m.ruegen.map((r) => (
                  <li key={r.id} className={(r.nachfristBis ?? r.fristBis) < heute && !m.erledigtAm ? "abgelaufen" : undefined}>
                    <b>{r.stufe}. Rüge</b> vom {deDatum(r.geruegtAm)} – Frist bis {deDatum(r.nachfristBis ?? r.fristBis)}
                    {r.bemerkung ? <div className="hint">{r.bemerkung}</div> : null}
                    <a href={`${pfad}/ruege/${r.stufe}`} className="symbol" title="Rügeschreiben drucken">
                      <Printer size={16} />
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint">Noch nicht gerügt.</p>
            )}
            {m.naechsteRuege && m.handwerker ? (
              <Formular aktion={ruegen.bind(null, id)} knopf={`${m.naechsteRuege.stufe}. Rüge erfassen`} className="formular">
                <div className="raster">
                  <Feld label="Gerügt am" name="geruegtAm" typ="date" wert={heute} pflicht />
                  <Feld label="Frist bis" name="fristBis" typ="date" wert={m.naechsteRuege.fristBis} hinweis="Vorschlag: 14 / 10 / 7 Tage" />
                  <Feld label="Bemerkung" name="bemerkung" />
                </div>
              </Formular>
            ) : !m.erledigtAm && m.ruegen.length >= 3 ? (
              <p className="fehler">Dreimal gerügt – Ersatzvornahme prüfen und das Datum unten bei „Bearbeiten“ eintragen.</p>
            ) : !m.handwerker && !m.erledigtAm ? (
              <p className="hint">Für eine Rüge bitte unter „Bearbeiten“ den verantwortlichen Handwerker (Vertrag) zuordnen.</p>
            ) : null}
          </section>
        </div>

        <section className="aktionsspalte">
          <div className="karte hinweise">
            <div className="neutral">
              <b>{m.handwerker ? partnerName(m.handwerker) || m.handwerker.suchcode : "Kein Handwerker zugeordnet"}</b>
            </div>
            {m.gewerk ? (
              <div className="neutral">
                Gewerk {m.gewerk.nr} {m.gewerk.bezeichnung}
                {m.vertrag ? (
                  <>
                    {" · "}
                    <a href={`/handwerkervertraege/${m.vertrag.id}`}>Vertrag</a>
                  </>
                ) : null}
              </div>
            ) : null}
            {m.vertrag?.gewaehrleistungBis ? (
              <div className={m.gewaehrleistungAbgelaufen ? "fehlt" : "ok"}>
                {m.gewaehrleistungAbgelaufen ? <AlertTriangle size={16} /> : <BadgeCheck size={16} />}
                {m.gewaehrleistungAbgelaufen
                  ? `Gewährleistung am ${deDatum(m.vertrag.gewaehrleistungBis)} abgelaufen – vor Feststellung des Mangels`
                  : `Gewährleistung bis ${deDatum(m.vertrag.gewaehrleistungBis)}`}
              </div>
            ) : m.vertrag ? (
              <div className="neutral">Gewährleistung: Abnahme oder Frist im Vertrag fehlt</div>
            ) : null}
            {Number(m.wertHandwerkerBrutto) ? (
              <div className="neutral">
                Wert Handwerker {deZahl(m.wertHandwerkerBrutto)} €{m.einbehalt ? " – wird einbehalten" : ""}
              </div>
            ) : null}
            {m.ersatzvornahmeAm ? <div className="fehlt">Ersatzvornahme am {deDatum(m.ersatzvornahmeAm)}</div> : null}
          </div>
          {m.erledigtAm ? (
            <div className="karte">
              <h2>Erledigt</h2>
              <p>
                am {deDatum(m.erledigtAm)}
                {m.erledigtVon ? ` – ${m.erledigtVon}` : ""}
              </p>
              <Formular aktion={wiedereroeffnen.bind(null, id)} knopf="Wieder eröffnen" knopfArt="zweitrangig" className="formular" bestaetigen="Mangel wieder eröffnen?" />
            </div>
          ) : (
            <div className="karte">
              <h2>Als erledigt markieren</h2>
              <Formular aktion={erledigen.bind(null, id)} knopf="Erledigt" className="formular">
                <Feld label="Erledigt am" name="erledigtAm" typ="date" wert={heute} pflicht />
                <Feld label="Bestätigt durch" name="erledigtVon" hinweis="z. B. Bauleitung, Kunde, Gutachter" />
              </Formular>
            </div>
          )}
        </section>
      </div>

      <details className="karte">
        <summary>Bearbeiten</summary>
        <Formular aktion={mangelAendern.bind(null, id)}>
          <MangelFelder m={m} projektId={m.projektId} einheiten={projekt.einheiten} kosten={kosten} />
        </Formular>
      </details>
      <details className="karte">
        <summary>Änderungsprotokoll ({protokoll.length})</summary>
        <Protokoll eintraege={protokoll} />
      </details>
    </>
  );
}
