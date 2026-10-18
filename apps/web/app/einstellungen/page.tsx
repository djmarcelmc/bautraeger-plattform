import { Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { basiszinsSpeichern } from "../verkauf/aktionen";

export const dynamic = "force-dynamic";

export default async function Einstellungen() {
  const saetze = await api<{ gueltigAb: string; satz: string }[]>("/basiszinssaetze");
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
    </>
  );
}
