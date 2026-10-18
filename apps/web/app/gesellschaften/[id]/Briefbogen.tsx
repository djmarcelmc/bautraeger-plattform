import type { BriefbogenEinstellung } from "@bt/domain";
import { FileText } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { briefbogenEinstellen, briefbogenEntfernen, briefbogenHochladen } from "../briefbogen-aktionen";

const zahl = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** Briefbogen der Gesellschaft: PDF hinterlegen, Satzspiegel einstellen, Musterbrief prüfen. */
export async function BriefbogenAbschnitt({ id }: { id: string }) {
  const b = await api<{ aktiv: boolean; dateiname: string | null; seiten: number | null; einstellung: BriefbogenEinstellung }>(`/gesellschaften/${id}/briefbogen`);
  const e = b.einstellung;
  const Feld = ({ name, label, wert, hinweis }: { name: keyof BriefbogenEinstellung; label: string; wert: number | null; hinweis?: string }) => (
    <label>
      <span>{label}</span>
      <input name={name} defaultValue={zahl(wert)} inputMode="decimal" className="zahl" />
      {hinweis ? <small className="hint">{hinweis}</small> : null}
    </label>
  );
  return (
    <section className="karte briefbogen-einstellung">
      <h2 className="mitsymbol">
        <FileText size={18} /> Briefbogen für Schreiben
      </h2>
      <p className="hint">
        Zahlungsanforderungen, Mahnungen, Angebote, Rügen und Belege dieser Gesellschaft werden auf ihrem Briefbogen gesetzt: im PDF (auch beim E-Mail-Versand) liegt der
        Briefbogen verlustfrei hinter dem Text, beim Drucken passen die Ränder für vorgedrucktes Briefpapier. Ein zweiseitiges PDF verwendet die 2. Seite für Folgeseiten.
      </p>
      <div className="zweispaltig">
        <div>
          {b.aktiv ? (
            <>
              <iframe className="briefbogen-vorschau" src={`/gesellschaften/${id}/briefbogen.pdf#toolbar=0&navpanes=0&view=Fit`} title="Briefbogen" />
              <p className="hint">
                {b.dateiname} · {b.seiten === 2 ? "mit Folgeseite" : "eine Seite (auch für Folgeseiten)"}
              </p>
              <div className="knopfleiste">
                <a className="knopf" href={`/gesellschaften/${id}/musterbrief`}>
                  Musterbrief ansehen
                </a>
                <a className="knopf zweitrangig" href={`/schreiben/pdf?pfad=${encodeURIComponent(`/gesellschaften/${id}/musterbrief`)}`} target="_blank" rel="noreferrer">
                  Musterbrief als PDF
                </a>
              </div>
            </>
          ) : (
            <p className="leer">Noch kein Briefbogen hinterlegt – Schreiben erscheinen mit schlichtem Kopf.</p>
          )}
          <Formular aktion={briefbogenHochladen.bind(null, id)} knopf={b.aktiv ? "Briefbogen ersetzen" : "Briefbogen hochladen"} zuruecksetzen className="formular upload">
            <div className="uploadfeld">
              <input type="file" name="datei" accept="application/pdf,.pdf" required />
            </div>
            <p className="hint">PDF in DIN A4 hochkant, ohne Text im Briefbereich (Word-Vorlage: „Speichern unter → PDF“).</p>
          </Formular>
          {b.aktiv ? <Formular aktion={briefbogenEntfernen.bind(null, id)} knopf="Briefbogen entfernen" knopfArt="zweitrangig" bestaetigen="Briefbogen entfernen? Schreiben erscheinen dann wieder ohne." /> : null}
        </div>
        <Formular aktion={briefbogenEinstellen.bind(null, id)} knopf="Satzspiegel speichern">
          <fieldset>
            <legend>Ränder in mm vom Blattrand</legend>
            <div className="raster">
              <Feld name="randObenErsteSeite" label="oben, erste Seite" wert={e.randObenErsteSeite} hinweis="Beginn des Anschriftfelds (DIN 5008: 45)" />
              <Feld name="randObenFolgeseiten" label="oben, Folgeseiten" wert={e.randObenFolgeseiten} />
              <Feld name="randUnten" label="unten" wert={e.randUnten} hinweis="über der Fußzeile des Briefbogens" />
              <Feld name="randLinks" label="links" wert={e.randLinks} />
              <Feld name="randRechts" label="rechts" wert={e.randRechts} />
              <Feld name="textAb" label="Betreff frühestens ab" wert={e.textAb} hinweis="optional, z. B. unter vorgedruckten Feldern" />
            </div>
          </fieldset>
          <fieldset>
            <legend>Vorgedruckte Felder (optional)</legend>
            <div className="raster">
              <Feld name="datumX" label="Datum: von links" wert={e.datumX} />
              <Feld name="datumY" label="Datum: von oben" wert={e.datumY} />
              <Feld name="zeichenX" label="Unser Zeichen: von links" wert={e.zeichenX} />
              <Feld name="zeichenY" label="Unser Zeichen: von oben" wert={e.zeichenY} />
              <label>
                <span>Unser Zeichen</span>
                <input name="zeichenText" defaultValue={e.zeichenText ?? ""} maxLength={20} placeholder="z. B. MD" />
              </label>
            </div>
            <label className="haken">
              <input type="checkbox" name="absenderzeileAusblenden" defaultChecked={e.absenderzeileAusblenden} /> eigene Absenderzeile weglassen (Briefbogen hat eine Rücksendezeile)
            </label>
          </fieldset>
        </Formular>
      </div>
    </section>
  );
}
