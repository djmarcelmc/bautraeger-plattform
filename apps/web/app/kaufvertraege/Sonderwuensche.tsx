import { MABV_ABSCHNITTE, SONDERWUNSCH_ART_TEXT, SONDERWUNSCH_STATUS_TEXT, angebotAbgelaufen } from "@bt/domain";
import { FileText, Info } from "lucide-react";
import { Auswahl, Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { RatenStatus } from "@/components/RatenStatus";
import { deDatum, deZahl } from "@/lib/format";
import type { VertragDetail } from "@/lib/typen";
import { sonderwunschAnlegen, sonderwunschEntscheiden, sonderwunschLoeschen, sonderwunschZuruecksetzen } from "../sonderwuensche/aktionen";

const STATUS_KLASSE = { angebot: "info", beauftragt: "gut", abgelehnt: "" } as const;
const abschnittText = (k: string | null) => (k ? (MABV_ABSCHNITTE.find((a) => a.key === k)?.bezeichnung ?? k) : "sofort nach Beauftragung");

/** Reiter „Sonderwünsche“ am Kaufvertrag: Angebote, Entscheidung, entstandene Raten. */
export function Sonderwuensche({ v, gewerke }: { v: VertragDetail; gewerke: { id: string; nr: number; bezeichnung: string }[] }) {
  const pfad = `/kaufvertraege/${v.id}`;
  const heute = new Date().toISOString().slice(0, 10);
  const rate = new Map(v.raten.map((r) => [r.id, r]));
  return (
    <>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th className="num">Nr.</th>
              <th>Leistung</th>
              <th>Abrechnung</th>
              <th className="num">Preis €</th>
              <th>Stand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.sonderwuensche.map((s) => {
              const r = s.rateId ? rate.get(s.rateId) : undefined;
              const gutschrift = s.art === "gutschrift";
              return (
                <tr key={s.id}>
                  <td className="num">{s.nr}</td>
                  <td>
                    <b>{s.bezeichnung}</b>
                    {gutschrift ? <span className="badge warnung klein">Gutschrift</span> : null}
                    {s.beschreibung ? <div className="hint">{s.beschreibung}</div> : null}
                  </td>
                  <td className="hint">{abschnittText(s.abschnitt)}</td>
                  <td className={`num${gutschrift ? " minus" : ""}`}>
                    {gutschrift ? "−" : ""}
                    {deZahl(s.betragBrutto)}
                    {s.kostenBrutto !== null ? <div className="hint">Kosten {deZahl(s.kostenBrutto)}</div> : null}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_KLASSE[s.status]}`}>{SONDERWUNSCH_STATUS_TEXT[s.status]}</span>
                    {angebotAbgelaufen(s, heute) ? <span className="badge warnung">abgelaufen</span> : null}
                    <div className="hint">
                      {s.status === "angebot" ? `vom ${deDatum(s.angebotAm)}${s.gueltigBis ? `, gültig bis ${deDatum(s.gueltigBis)}` : ""}` : `am ${deDatum(s.entschiedenAm)}`}
                    </div>
                    {r ? (
                      <div className="hint">
                        Rate {r.nr}: {Number(r.betrag) < 0 && r.zahlungsanforderungId ? <span className="badge gut">verrechnet</span> : <RatenStatus status={r.status} />}
                      </div>
                    ) : null}
                  </td>
                  <td className="aktionsspalte">
                    <a className="knopf zweitrangig klein" href={`/sonderwuensche/${s.id}`}>
                      <FileText size={14} /> {s.status === "angebot" ? "Angebot" : "Details"}
                    </a>
                    {s.status === "angebot" ? (
                      <details className="bauabzugerfassung">
                        <summary className="knopf zweitrangig klein">Entscheidung</summary>
                        <Formular aktion={sonderwunschEntscheiden.bind(null, s.id, pfad)} knopf="Speichern">
                          <label>
                            Datum
                            <input type="date" name="datum" defaultValue={heute} required />
                          </label>
                          <label>
                            Käufer hat
                            <select name="entscheidung" defaultValue="beauftragen">
                              <option value="beauftragen">beauftragt</option>
                              <option value="ablehnen">abgelehnt</option>
                            </select>
                          </label>
                        </Formular>
                        <Formular aktion={sonderwunschLoeschen.bind(null, s.id, pfad)} knopf="Angebot löschen" knopfArt="zweitrangig" bestaetigen={`Angebot Nr. ${s.nr} löschen?`} />
                      </details>
                    ) : !r?.zahlungsanforderungId ? (
                      <Formular
                        aktion={sonderwunschZuruecksetzen.bind(null, s.id, pfad)}
                        knopf="Zurücksetzen"
                        knopfArt="zweitrangig"
                        bestaetigen={`Sonderwunsch Nr. ${s.nr} wieder zum Angebot machen?${r ? " Die Rate wird aus dem Ratenplan entfernt." : ""}`}
                        className="formular inline"
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {v.sonderwuensche.length ? (
            <tfoot>
              <tr>
                <td colSpan={3}>beauftragt (Zusatzleistungen abzüglich Gutschriften)</td>
                <td className="num">
                  <b>{deZahl(v.summen.sonderwuensche)}</b>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
        {!v.sonderwuensche.length && <p className="leer">Noch keine Sonderwünsche – unten das erste Angebot anlegen.</p>}
      </div>

      <section className="karte">
        <h2>Neues Angebot</h2>
        <p className="hint mitsymbol">
          <Info size={14} /> Mit der Beauftragung entsteht eine eigene Rate im Ratenplan. Gutschriften werden mit der nächsten Anforderung verrechnet. Ob eine Änderung des
          beurkundeten Vertrags notariell beurkundet werden muss, im Zweifel mit dem Notar klären.
        </p>
        <Formular aktion={sonderwunschAnlegen.bind(null, v.id, pfad)} knopf="Angebot anlegen" zuruecksetzen>
          <div className="raster">
            <Auswahl label="Art" name="art" wert="zusatzleistung" optionen={Object.entries(SONDERWUNSCH_ART_TEXT).map(([wert, text]) => ({ wert, text }))} />
            <Feld label="Leistung" name="bezeichnung" pflicht breit />
            <label className="breit">
              <span>Beschreibung</span>
              <textarea name="beschreibung" rows={3} />
            </label>
            <Feld label="Preis für den Käufer (brutto) €" name="betragBrutto" zahl pflicht />
            <Feld label="Kosten Handwerker (brutto) €" name="kostenBrutto" zahl hinweis="optional – für die Marge" />
            <Auswahl label="Gewerk" name="gewerkId" leer="– keins –" optionen={gewerke.map((g) => ({ wert: g.id, text: `${g.nr} ${g.bezeichnung}` }))} />
            <Auswahl label="Abrechnung" name="abschnitt" leer="sofort nach Beauftragung" optionen={MABV_ABSCHNITTE.map((a) => ({ wert: a.key, text: `mit Abschnitt: ${a.bezeichnung}` }))} />
            <Feld label="Angebot vom" name="angebotAm" typ="date" wert={heute} />
            <Feld label="gültig bis" name="gueltigBis" typ="date" />
          </div>
        </Formular>
      </section>
    </>
  );
}
