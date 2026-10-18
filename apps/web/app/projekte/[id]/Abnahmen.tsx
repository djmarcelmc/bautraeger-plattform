import { ABNAHME_ART_TEXT, ABNAHME_ARTEN, ABNAHME_ERGEBNIS_TEXT } from "@bt/domain";
import { ClipboardCheck } from "lucide-react";
import { Auswahl } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import type { AbnahmeListe, KaufvertragListe, Kostenkontrolle } from "@/lib/typen";
import { abnahmeAnlegen } from "../../abnahmen/aktionen";
import { AbnahmeFelder } from "../../abnahmen/AbnahmeFelder";

export function ErgebnisBadge({ ergebnis, abgeschlossen }: { ergebnis: string | null; abgeschlossen: boolean }) {
  if (!abgeschlossen) return <span className="badge warnung">in Bearbeitung</span>;
  const k = ergebnis === "abgenommen" ? "gut" : ergebnis === "vorbehalt" ? "info" : "gefahr";
  return <span className={`badge ${k}`}>{ergebnis === "vorbehalt" ? "unter Vorbehalt" : (ABNAHME_ERGEBNIS_TEXT[ergebnis as keyof typeof ABNAHME_ERGEBNIS_TEXT] ?? ergebnis)}</span>;
}

export async function AbnahmenReiter({ projektId }: { projektId: string }) {
  const [liste, vertraege, kosten] = await Promise.all([
    api<AbnahmeListe[]>(`/abnahmen?projektId=${projektId}`),
    api<KaufvertragListe[]>(`/kaufvertraege?projektId=${projektId}`),
    api<Kostenkontrolle>(`/projekte/${projektId}/kosten`),
  ]);
  const hwVertraege = kosten.gewerke.flatMap((g) => g.vertraege.map((v) => ({ wert: v.id, text: `${g.nr} ${g.bezeichnung} – ${v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode ?? ""}` })));
  return (
    <>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Art</th>
              <th>Bezug</th>
              <th>Datum</th>
              <th className="num">Mängel (offen)</th>
              <th>Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id} className="klickbar">
                <td>
                  <a href={`/abnahmen/${a.id}`} className="zeilenlink">
                    {a.nr}
                  </a>
                </td>
                <td>{a.artText}</td>
                <td>
                  {a.bezug ?? "Gemeinschaftseigentum"}
                  {a.einheit ? <div className="hint">Einheit {a.einheit}</div> : null}
                </td>
                <td>{deDatum(a.datum)}</td>
                <td className="num">
                  {a.maengel} ({a.maengelOffen})
                </td>
                <td>
                  <ErgebnisBadge ergebnis={a.ergebnis} abgeschlossen={!!a.abgeschlossenAm} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && (
          <p className="leer">
            <ClipboardCheck size={18} /> Noch keine Abnahme. Lege rechts eine an – das Protokoll lässt sich anschließend drucken und unterschreiben.
          </p>
        )}
      </div>
      <section className="karte">
        <h2>Neue Abnahme</h2>
        <Formular aktion={abnahmeAnlegen.bind(null, projektId)} knopf="Abnahme anlegen">
          <div className="raster">
            <Auswahl label="Art" name="art" wert="sondereigentum" optionen={ABNAHME_ARTEN.map((a) => ({ wert: a, text: ABNAHME_ART_TEXT[a] }))} pflicht />
            <Auswahl label="Kaufvertrag (Sondereigentum)" name="kaufvertragId" leer="–" optionen={vertraege.map((v) => ({ wert: v.id, text: `${v.nr} – ${v.kaeufer ?? ""} (${v.einheiten ?? ""})` }))} />
            <Auswahl label="Handwerkervertrag (Handwerkerabnahme)" name="handwerkervertragId" leer="–" optionen={hwVertraege} />
          </div>
          <AbnahmeFelder />
        </Formular>
      </section>
    </>
  );
}
