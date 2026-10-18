"use client";

import type { ImportPruefung, ImportStatus } from "@bt/domain";
import { CircleAlert, CircleCheck, FileSpreadsheet, Download, RefreshCw, Plus, Equal } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importAusfuehren, importPruefen } from "./aktionen";

type Art = "partner" | "einheiten";
interface Spalte {
  titel: string;
  pflicht: boolean;
  hinweis?: string;
}

const STATUS: Record<ImportStatus, { text: string; klasse: string }> = {
  neu: { text: "neu", klasse: "gut" },
  aktualisieren: { text: "wird aktualisiert", klasse: "info" },
  unveraendert: { text: "unverändert", klasse: "" },
  fehler: { text: "Fehler", klasse: "gefahr" },
};

export function ImportAssistent({
  projekte,
  spalten,
  startArt,
  startProjekt,
}: {
  projekte: { id: string; text: string }[];
  spalten: Record<Art, Spalte[]>;
  startArt: Art;
  startProjekt?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [art, setArt] = useState<Art>(startArt);
  const [pruefung, setPruefung] = useState<ImportPruefung | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [nurFehler, setNurFehler] = useState(false);
  const [laeuft, starte] = useTransition();
  const [projektId, setProjektId] = useState(startProjekt && projekte.some((p) => p.id === startProjekt) ? startProjekt : "");

  function zuruecksetzen() {
    setPruefung(null);
    setFehler([]);
    setMeldung(null);
  }

  function pruefen(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    starte(async () => {
      setMeldung(null);
      const r = await importPruefen(fd);
      setFehler(r.fehler ?? []);
      setPruefung(r.pruefung ?? null);
      setNurFehler(!!r.pruefung && r.pruefung.anzahl.fehler > 0);
    });
  }

  function uebernehmen() {
    if (!formRef.current || !pruefung) return;
    const anzahl = pruefung.anzahl.neu + pruefung.anzahl.aktualisieren;
    if (!window.confirm(`${anzahl} Datensätze jetzt übernehmen?`)) return;
    const fd = new FormData(formRef.current);
    starte(async () => {
      const r = await importAusfuehren(fd);
      setFehler(r.fehler ?? []);
      if (!r.fehler?.length) {
        setPruefung(null);
        setMeldung(r.meldung ?? "Import abgeschlossen.");
        formRef.current?.reset();
      }
    });
  }

  const zeilen = pruefung ? pruefung.zeilen.filter((z) => !nurFehler || z.status === "fehler") : [];

  return (
    <div className="importassistent">
      <form ref={formRef} onSubmit={pruefen} onChange={(e) => (e.target as HTMLElement).getAttribute("name") !== "nurFehler" && pruefung && zuruecksetzen()} className="karte">
        <h2>
          <FileSpreadsheet size={18} /> Daten aus Excel oder CSV übernehmen
        </h2>
        <p className="hint">
          Für die Datenübernahme aus AMADEUS X oder bestehenden Listen. Die Datei wird zuerst nur geprüft – gespeichert wird erst nach Ihrer Bestätigung, und zwar ganz oder gar nicht.
        </p>

        <ol className="importschritte">
          <li>
            <b>Was wird importiert?</b>
            <div className="segment">
              {(["partner", "einheiten"] as const).map((a) => (
                <label key={a}>
                  <input type="radio" name="art" value={a} checked={art === a} onChange={() => setArt(a)} />
                  <span>{a === "partner" ? "Geschäftspartner" : "Einheiten eines Projekts"}</span>
                </label>
              ))}
            </div>
            {art === "einheiten" ? (
              <label className="importprojekt">
                Projekt
                <select name="projektId" value={projektId} onChange={(e) => setProjektId(e.target.value)} required>
                  <option value="">– bitte wählen –</option>
                  {projekte.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.text}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </li>
          <li>
            <b>Datei vorbereiten</b>
            <span className="hint">
              Erste Zeile = Spaltenüberschriften. Spalten dürfen fehlen, umsortiert sein oder anders heißen – gängige Bezeichnungen werden erkannt.
            </span>
            <div className="badges">
              {spalten[art].map((s) => (
                <span key={s.titel} className={`badge${s.pflicht ? " warnung" : ""}`} title={s.hinweis}>
                  {s.titel}
                  {s.pflicht ? " *" : ""}
                </span>
              ))}
            </div>
            <a className="knopf zweitrangig klein" href={`/einstellungen/import/vorlage/${art}`}>
              <Download size={15} /> Excel-Vorlage herunterladen
            </a>
          </li>
          <li>
            <b>Datei hochladen und prüfen</b>
            <div className="uploadfeld">
              <input type="file" name="datei" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required />
              <label className="haken-reihe">
                <input type="checkbox" name="aktualisieren" /> Vorhandene aktualisieren (gleiche Nr.)
              </label>
              <button type="submit" disabled={laeuft}>
                {laeuft && !pruefung ? "Bitte warten …" : "Datei prüfen"}
              </button>
            </div>
          </li>
        </ol>

        {fehler.length ? (
          <div className="fehler" role="alert">
            {fehler.map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>
        ) : null}
        {meldung ? (
          <div className="meldung">
            {meldung} <a href={art === "partner" ? "/partner" : projektId ? `/projekte/${projektId}` : "/projekte"}>Ansehen →</a>
          </div>
        ) : null}
      </form>

      {pruefung ? (
        <section className="karte">
          <div className="pruefkopf">
            <h2>Ergebnis der Prüfung</h2>
            {pruefung.bereit ? (
              <span className="badge gut">
                <CircleCheck size={14} /> bereit zur Übernahme
              </span>
            ) : (
              <span className="badge gefahr">
                <CircleAlert size={14} /> bitte Datei korrigieren
              </span>
            )}
          </div>
          <div className="kpis">
            <div className="kpi">
              <span>
                <Plus size={15} /> neu
              </span>
              <b>{pruefung.anzahl.neu}</b>
            </div>
            <div className="kpi">
              <span>
                <RefreshCw size={15} /> aktualisieren
              </span>
              <b>{pruefung.anzahl.aktualisieren}</b>
            </div>
            <div className="kpi">
              <span>
                <Equal size={15} /> unverändert
              </span>
              <b>{pruefung.anzahl.unveraendert}</b>
            </div>
            <div className={`kpi${pruefung.anzahl.fehler ? " kpi-warnung" : ""}`}>
              <span>
                <CircleAlert size={15} /> mit Fehlern
              </span>
              <b>{pruefung.anzahl.fehler}</b>
            </div>
          </div>

          <div className="importspalten">
            <div>
              <h3>Erkannte Spalten</h3>
              <div className="badges">
                {pruefung.zuordnung.erkannt.map((s) => (
                  <span key={s.titel} className="badge gut" title={s.titel === s.spalte ? undefined : `„${s.titel}“ → ${s.spalte}`}>
                    {s.titel === s.spalte ? s.titel : `${s.titel} → ${s.spalte}`}
                  </span>
                ))}
              </div>
            </div>
            {pruefung.zuordnung.unbekannt.length ? (
              <div>
                <h3>Nicht zugeordnet (werden ignoriert)</h3>
                <div className="badges">
                  {pruefung.zuordnung.unbekannt.map((s) => (
                    <span key={s} className="badge">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {pruefung.zuordnung.fehlendePflicht.length ? (
              <div>
                <h3>Fehlende Pflichtspalten</h3>
                <div className="badges">
                  {pruefung.zuordnung.fehlendePflicht.map((s) => (
                    <span key={s} className="badge gefahr">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {pruefung.anzahl.fehler ? (
            <label className="haken-reihe">
              <input type="checkbox" name="nurFehler" checked={nurFehler} onChange={(e) => setNurFehler(e.target.checked)} /> nur Zeilen mit Fehlern zeigen
            </label>
          ) : null}
          <div className="tabellenrahmen">
            <table>
              <thead>
                <tr>
                  <th className="num">Zeile</th>
                  <th>Nr.</th>
                  <th>Bezeichnung</th>
                  <th>Status</th>
                  <th>Hinweise</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.slice(0, 500).map((z) => (
                  <tr key={z.zeile}>
                    <td className="num">{z.zeile}</td>
                    <td>{z.schluessel}</td>
                    <td>{z.bezeichnung}</td>
                    <td>
                      <span className={`badge ${STATUS[z.status].klasse}`}>{STATUS[z.status].text}</span>
                    </td>
                    <td>
                      {z.fehler.length ? (
                        <ul className="importfehler">
                          {z.fehler.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      ) : z.zugehoerigZu ? (
                        <span className="hint">gehört zu {z.zugehoerigZu}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {zeilen.length > 500 ? <p className="hint">… und {zeilen.length - 500} weitere Zeilen</p> : null}
          </div>
          <div className="aktionen">
            <button type="button" onClick={uebernehmen} disabled={!pruefung.bereit || laeuft}>
              {laeuft ? "Wird übernommen …" : `${pruefung.anzahl.neu + pruefung.anzahl.aktualisieren} Datensätze übernehmen`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
