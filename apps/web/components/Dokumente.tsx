import { PORTAL_ORDNER } from "@bt/domain";
import { FileText, Paperclip } from "lucide-react";
import { dokumentAusblenden, dokumentHochladen } from "@/app/dokumente/aktionen";
import { api } from "@/lib/api";
import { Formular } from "./Formular";

interface Dokument {
  id: string;
  dateiname: string;
  ordner: string | null;
  mimeType: string | null;
  groesse: number | null;
  beschreibung: string | null;
  hochgeladenVon: string | null;
  angelegtAm: string;
}

const groesse = (b: number | null) =>
  b === null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/** Dokumentablage für ein Objekt: Liste, Upload (mehrere Dateien) und Ausblenden. */
export async function Dokumente({ objektTyp, objektId, pfad }: { objektTyp: string; objektId: string; pfad: string }) {
  const liste = await api<Dokument[]>(`/dokumente?objektTyp=${objektTyp}&objektId=${objektId}`);
  return (
    <div className="dokumente">
      <div className="karte ohne-innenabstand">
        {liste.length ? (
          <ul className="dokliste">
            {liste.map((d) => (
              <li key={d.id}>
                {d.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dokbild" src={`/dokumente/${d.id}`} alt="" loading="lazy" />
                ) : (
                  <span className="dokicon">
                    <FileText size={18} />
                  </span>
                )}
                <a href={`/dokumente/${d.id}`} target="_blank" rel="noreferrer" className="dokname">
                  {d.dateiname}
                  {objektTyp === "kaufvertrag" && (PORTAL_ORDNER as readonly string[]).includes(d.ordner ?? "") ? <span className="badge info klein">im Käuferportal</span> : null}
                  <small>
                    {[d.beschreibung, groesse(d.groesse), new Date(d.angelegtAm).toLocaleDateString("de-DE"), d.hochgeladenVon]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </a>
                <Formular
                  aktion={dokumentAusblenden.bind(null, d.id, pfad)}
                  knopf="Ausblenden"
                  knopfArt="zweitrangig"
                  bestaetigen={`„${d.dateiname}“ ausblenden? Die Datei bleibt revisionssicher archiviert.`}
                  className="inline"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="leer">
            <Paperclip size={16} /> Noch keine Dokumente.
          </p>
        )}
      </div>
      <Formular aktion={dokumentHochladen.bind(null, objektTyp, objektId, pfad)} knopf="Hochladen" zuruecksetzen className="formular upload">
        <div className="uploadfeld">
          <input type="file" name="datei" multiple required />
          <input name="beschreibung" placeholder="Beschreibung (optional)" />
          {objektTyp === "kaufvertrag" ? (
            <label className="haken-reihe portalfreigabe">
              <input type="checkbox" name="ordner" value="Käuferportal" /> im Käuferportal zeigen
            </label>
          ) : null}
        </div>
      </Formular>
    </div>
  );
}
