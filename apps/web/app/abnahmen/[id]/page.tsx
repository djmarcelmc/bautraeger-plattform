import { ABNAHME_ERGEBNIS_TEXT, ABNAHME_ERGEBNISSE, MANGEL_STATUS_TEXT, ZAEHLER, ZAEHLER_TEXT } from "@bt/domain";
import { ClipboardCheck, Printer, TriangleAlert } from "lucide-react";
import { Auswahl, Feld, Haken } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { MangelStatus } from "@/components/MangelStatus";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import { partnerName, type AbnahmeDetail, type Kostenkontrolle, type Mangelvorlage } from "@/lib/typen";
import { ErgebnisBadge } from "../../projekte/[id]/Abnahmen";
import { abnahmeAbschliessen, abnahmeAendern, abnahmeLoeschen, abnahmeMaengel } from "../aktionen";
import { AbnahmeFelder } from "../AbnahmeFelder";

export const dynamic = "force-dynamic";

export default async function AbnahmeSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api<AbnahmeDetail>(`/abnahmen/${id}`);
  const offen = !a.abgeschlossenAm;
  const [vorlagen, kosten] = offen ? await Promise.all([api<Mangelvorlage[]>("/mangelvorlagen"), api<Kostenkontrolle>(`/projekte/${a.projekt.id}/kosten`)]) : [[], null];
  const kategorien = [...new Set(vorlagen.map((v) => v.kategorie))];
  const bezug = a.kaufvertrag
    ? `${a.kaufvertrag.kaeufer.map(partnerName).join(", ")} · Kaufvertrag ${a.kaufvertrag.nr}${a.einheit ? ` · Einheit ${a.einheit.nr}` : ""}`
    : a.handwerkervertrag
      ? `${a.handwerkervertrag.handwerker ? partnerName(a.handwerkervertrag.handwerker) : ""} · ${a.handwerkervertrag.gewerk}`
      : "Gemeinschaftseigentum";
  return (
    <>
      <p className="brotkrumen">
        <a href={`/projekte/${a.projekt.id}?reiter=abnahmen`}>
          {a.projekt.nr} {a.projekt.suchcode}
        </a>{" "}
        › Abnahmen ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>
            {a.artText} Nr. {a.nr}
          </h1>
          <p className="untertitel">
            {bezug} · {deDatum(a.datum)}
          </p>
        </div>
        <div className="aktionen">
          <ErgebnisBadge ergebnis={a.ergebnis} abgeschlossen={!offen} />
          <a className="knopf zweitrangig-link" href={`/abnahmen/${id}/druck`}>
            <Printer size={16} /> Protokoll drucken
          </a>
        </div>
      </div>

      {!offen && (
        <div className="hinweisbox erfolg">
          <ClipboardCheck size={16} />
          <div>
            Abgeschlossen am {deDatum(a.abgeschlossenAm)} von {a.abgeschlossenVon}: <b>{ABNAHME_ERGEBNIS_TEXT[a.ergebnis!]}</b>
            {a.vorbehaltVertragsstrafe ? " · Vertragsstrafe vorbehalten" : ""}
            {a.ergebnis !== "verweigert" && a.gewaehrleistungMonate ? ` · Gewährleistung ${a.gewaehrleistungMonate} Monate` : ""}
            {a.kaufvertrag?.gewaehrleistungBis ? ` (bis ${deDatum(a.kaufvertrag.gewaehrleistungBis)})` : ""}.
          </div>
        </div>
      )}

      <section className="karte ohne-innenabstand">
        <h2 className="kartentitel">Festgestellte Mängel ({a.maengel.length})</h2>
        {a.maengel.length ? (
          <table>
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Mangel</th>
                <th>Ort</th>
                <th>Gewerk / Handwerker</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {a.maengel.map((m) => (
                <tr key={m.id} className="klickbar">
                  <td>
                    <a href={`/maengel/${m.id}`} className="zeilenlink">
                      {a.projekt.nr}-{m.nr}
                    </a>
                  </td>
                  <td>
                    {m.titel}
                    {m.beschreibung ? <div className="hint">{m.beschreibung}</div> : null}
                  </td>
                  <td>{m.ort}</td>
                  <td>
                    {m.gewerk ?? <span className="hint">–</span>}
                    {m.handwerker ? <div className="hint">{m.handwerker}</div> : null}
                  </td>
                  <td>
                    <MangelStatus status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="leer">Keine Mängel festgestellt.</p>
        )}
      </section>

      {offen && (
        <>
          <div className="zweispaltig">
            <section className="karte">
              <h2>Mangel erfassen</h2>
              <Formular aktion={abnahmeMaengel.bind(null, id)} knopf="Mangel erfassen" zuruecksetzen>
                <Feld label="Kurzbeschreibung" name="titel" pflicht breit />
                <div className="raster">
                  <Feld label="Lage / Ort" name="ort" hinweis="z. B. Bad, Wohnzimmer Fenster links" />
                  {a.art !== "handwerker" && kosten ? (
                    <Auswahl label="Gewerk" name="gewerkId" leer="– offen –" optionen={kosten.gewerke.map((g) => ({ wert: g.id, text: `${g.nr} ${g.bezeichnung}` }))} />
                  ) : null}
                </div>
                <label className="breit">
                  <span>Beschreibung</span>
                  <textarea name="beschreibung" rows={2} />
                </label>
              </Formular>
            </section>
            <section className="karte">
              <h2>Aus Standardmängeln</h2>
              {vorlagen.length ? (
                <Formular aktion={abnahmeMaengel.bind(null, id)} knopf="Ausgewählte übernehmen" zuruecksetzen>
                  <Feld label="Lage / Ort (für alle ausgewählten)" name="ort" breit />
                  <div className="vorlagenliste">
                    {kategorien.map((k) => (
                      <details key={k}>
                        <summary>
                          {k} <span className="hint">({vorlagen.filter((v) => v.kategorie === k).length})</span>
                        </summary>
                        {vorlagen
                          .filter((v) => v.kategorie === k)
                          .map((v) => (
                            <label key={v.id} className="haken" title={v.beschreibung ?? undefined}>
                              <input type="checkbox" name="vorlageIds" value={v.id} /> {v.titel}
                            </label>
                          ))}
                      </details>
                    ))}
                  </div>
                </Formular>
              ) : (
                <p className="hint">
                  Noch kein Katalog vorhanden – unter <a href="/einstellungen">Einstellungen</a> den Standardkatalog übernehmen.
                </p>
              )}
            </section>
          </div>

          <div className="zweispaltig">
            <section className="karte">
              <h2>Protokolldaten</h2>
              <Formular aktion={abnahmeAendern.bind(null, id)}>
                <input type="hidden" name="art" value={a.art} />
                {a.kaufvertragId ? <input type="hidden" name="kaufvertragId" value={a.kaufvertragId} /> : null}
                {a.einheitId ? <input type="hidden" name="einheitId" value={a.einheitId} /> : null}
                {a.handwerkervertragId ? <input type="hidden" name="handwerkervertragId" value={a.handwerkervertragId} /> : null}
                <AbnahmeFelder a={a} />
              </Formular>
            </section>
            <section className="karte">
              <h2>Abnahme abschließen</h2>
              <p className="hint">
                Nach dem Abschluss ist das Protokoll gesperrt.{" "}
                {a.art === "sondereigentum"
                  ? "Im Kaufvertrag werden Übergabe und Gewährleistungsende eingetragen."
                  : a.art === "handwerker"
                    ? "Im Handwerkervertrag wird das Abnahmedatum eingetragen – damit beginnt die Gewährleistung und Vertragserfüllungsbürgschaften werden zur Rückgabe fällig."
                    : "Ist im Projekt noch keine Fertigstellung (Ist) eingetragen, wird das Abnahmedatum übernommen."}{" "}
                Bei verweigerter Abnahme wird nichts übernommen.
              </p>
              {a.maengel.length > 0 && (
                <p className="hint warnung">
                  <TriangleAlert size={12} /> {a.maengel.length} Mängel festgestellt – Abnahme in der Regel „unter Vorbehalt“.
                </p>
              )}
              <Formular aktion={abnahmeAbschliessen.bind(null, id)} knopf="Abnahme abschließen" bestaetigen="Abnahme jetzt abschließen? Das Protokoll kann danach nicht mehr geändert werden.">
                <Auswahl label="Ergebnis" name="ergebnis" wert={a.maengel.length ? "vorbehalt" : "abgenommen"} optionen={ABNAHME_ERGEBNISSE.map((e) => ({ wert: e, text: ABNAHME_ERGEBNIS_TEXT[e] }))} pflicht />
                <div className="raster">
                  <Feld label="Gewährleistung (Monate)" name="gewaehrleistungMonate" wert={60} zahl hinweis="Bauwerk: 5 Jahre (§ 634a BGB)" />
                </div>
                <Haken label="Vertragsstrafe vorbehalten (§ 341 Abs. 3 BGB)" name="vorbehaltVertragsstrafe" />
              </Formular>
              {!a.maengel.length && (
                <Formular aktion={abnahmeLoeschen.bind(null, id, a.projekt.id)} knopf="Abnahme löschen" knopfArt="gefahr" bestaetigen="Abnahme löschen?" className="formular rechts" />
              )}
            </section>
          </div>
        </>
      )}

      {!offen && (
        <section className="karte">
          <h2>Protokolldaten</h2>
          <dl className="datenliste">
            <dt>Teilnehmer</dt>
            <dd className="umbruch">{a.teilnehmer || "–"}</dd>
            {a.art !== "handwerker" && (
              <>
                <dt>Zählerstände</dt>
                <dd>
                  {ZAEHLER.filter((z) => a.zaehler[z])
                    .map((z) => `${ZAEHLER_TEXT[z]}: ${a.zaehler[z]}`)
                    .join(" · ") || "–"}
                </dd>
                <dt>Schlüssel</dt>
                <dd>{a.schluessel || "–"}</dd>
              </>
            )}
            <dt>Bemerkung</dt>
            <dd className="umbruch">{a.bemerkung || "–"}</dd>
          </dl>
        </section>
      )}
      <p className="hint">Status der Mängel: {Object.values(MANGEL_STATUS_TEXT).join(", ")}. Rügen und Erledigung pflegst du am einzelnen Mangel.</p>
    </>
  );
}
