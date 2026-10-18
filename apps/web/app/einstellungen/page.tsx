import { STANDARD_MAENGEL } from "@bt/domain";
import { Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Mangelvorlage } from "@/lib/typen";
import { standardkatalogUebernehmen, vorlageAnlegen, vorlageLoeschen } from "../abnahmen/aktionen";
import { basiszinsSpeichern } from "../verkauf/aktionen";
import { EinstellungenReiter } from "./Reiter";

export const dynamic = "force-dynamic";

export default async function Einstellungen() {
  const [saetze, vorlagen] = await Promise.all([api<{ gueltigAb: string; satz: string }[]>("/basiszinssaetze"), api<Mangelvorlage[]>("/mangelvorlagen")]);
  const naechster = (() => {
    const jetzt = new Date();
    const j = jetzt.getFullYear();
    return jetzt.getMonth() < 6 ? `${j}-07-01` : `${j + 1}-01-01`;
  })();
  const fehlt = !saetze.some((s) => s.gueltigAb === (new Date().getMonth() < 6 ? `${new Date().getFullYear()}-01-01` : `${new Date().getFullYear()}-07-01`));
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Einstellungen</h1>
          <p className="untertitel">Werte, die für alle Gesellschaften gelten</p>
        </div>
      </div>
      <EinstellungenReiter aktiv="allgemein" />
      <div className="zweispaltig">
        <section className="karte">
          <h2>Basiszinssatz nach § 247 BGB</h2>
          <p className="hint">
            Grundlage der Verzugszinsen. Die Deutsche Bundesbank gibt den Satz jeweils zum 01.01. und 01.07. bekannt
            {" – "}
            <a href="https://www.bundesbank.de/de/bundesbank/basiszinssatz-nach---247-bgb-607820" target="_blank" rel="noreferrer">
              aktuelle Werte bei der Bundesbank
            </a>
            .
          </p>
          {fehlt ? <p className="fehler">Für das laufende Halbjahr ist noch kein Basiszinssatz hinterlegt.</p> : null}
          <table>
            <thead>
              <tr>
                <th>gültig ab</th>
                <th className="num">Satz</th>
              </tr>
            </thead>
            <tbody>
              {saetze.map((s) => (
                <tr key={s.gueltigAb}>
                  <td>{deDatum(s.gueltigAb)}</td>
                  <td className="num">{deZahl(s.satz)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="karte">
          <h2>Neuen Basiszinssatz eintragen</h2>
          <Formular aktion={basiszinsSpeichern} knopf="Speichern" className="formular">
            <Feld label="Gültig ab" name="gueltigAb" typ="date" wert={naechster} pflicht hinweis="01.01. oder 01.07." />
            <Feld label="Satz in %" name="satz" zahl pflicht hinweis="z. B. 1,52 oder -0,88" />
          </Formular>
        </section>
      </div>

      <h2>Standardmängel-Katalog</h2>
      <p className="hint">Vorlagen für die schnelle Mängelerfassung bei Abnahmen. Die Gewerknummer ordnet den Mangel automatisch dem passenden Gewerk des Projekts zu.</p>
      <div className="zweispaltig">
        <section className="karte ohne-innenabstand">
          {vorlagen.length ? (
            <table>
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th className="num">Gewerk</th>
                  <th>Mangel</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vorlagen.map((v) => (
                  <tr key={v.id}>
                    <td>{v.kategorie}</td>
                    <td className="num">{v.gewerkNr ?? ""}</td>
                    <td>
                      {v.titel}
                      {v.beschreibung ? <div className="hint">{v.beschreibung}</div> : null}
                    </td>
                    <td>
                      <Formular aktion={vorlageLoeschen.bind(null, v.id)} knopf="Löschen" knopfArt="zweitrangig" className="formular eng" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="leer">
              <p>Noch keine Vorlagen.</p>
              <Formular aktion={standardkatalogUebernehmen} knopf={`Standardkatalog übernehmen (${STANDARD_MAENGEL.length} typische Abnahmemängel)`} className="formular" />
            </div>
          )}
        </section>
        <section className="karte">
          <h2>Vorlage hinzufügen</h2>
          <Formular aktion={vorlageAnlegen} knopf="Vorlage anlegen" zuruecksetzen>
            <div className="raster">
              <Feld label="Kategorie" name="kategorie" pflicht hinweis="z. B. Fliesen, Elektro" />
              <Feld label="Gewerk-Nr." name="gewerkNr" zahl hinweis="optional, z. B. 355" />
            </div>
            <Feld label="Mangel" name="titel" pflicht breit />
            <label className="breit">
              <span>Beschreibung / Maßnahme</span>
              <textarea name="beschreibung" rows={2} />
            </label>
          </Formular>
        </section>
      </div>
    </>
  );
}
