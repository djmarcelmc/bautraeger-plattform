import { umbuchungsQuellen } from "@bt/domain";
import { ArrowRight } from "lucide-react";
import { Auswahl, Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { deDatum, deZahl } from "@/lib/format";
import type { GewerkZeile } from "@/lib/typen";
import { budgetUmbuchen } from "./aktionen";

export interface Budgetumbuchung {
  id: string;
  betrag: string;
  begruendung: string;
  benutzer: string;
  angelegtAm: string;
  von: { id: string; nr: number; bezeichnung: string };
  nach: { id: string; nr: number; bezeichnung: string };
}

/** Budget auf dieses Gewerk umschichten – Quellen mit freiem Budget, vergebene (realisierte Einsparungen) zuerst. */
export function BudgetUmschichten({ projektId, gewerk, gewerke }: { projektId: string; gewerk: GewerkZeile; gewerke: GewerkZeile[] }) {
  const quellen = umbuchungsQuellen(gewerke, gewerk.id);
  const vorschlag = gewerk.budget.stufe === "ueber" ? gewerk.budget.ueberschreitung : Number(gewerk.budget.angeboten) ? gewerk.budget.angeboten : "";
  return (
    <details className="karte umbuchung" open={gewerk.budget.stufe === "ueber"}>
      <summary>Budget auf dieses Gewerk umschichten</summary>
      {quellen.length ? (
        <Formular aktion={budgetUmbuchen.bind(null, projektId)} knopf="Umbuchen" bestaetigen="Budget umbuchen? Die Schätzungen beider Gewerke werden angepasst und die Umbuchung protokolliert.">
          <input type="hidden" name="nachGewerkId" value={gewerk.id} />
          <div className="raster">
            <Auswahl
              label="von Gewerk"
              name="vonGewerkId"
              wert={quellen[0]!.id}
              pflicht
              optionen={quellen.map((q) => ({ wert: q.id, text: `${q.nr} ${q.bezeichnung} – frei ${deZahl(q.frei, 0)} €${q.gesichert ? " (Einsparung)" : " (noch nicht vergeben)"}` }))}
            />
            <Feld label="Betrag brutto €" name="betrag" wert={vorschlag ? deZahl(vorschlag) : undefined} zahl pflicht hinweis={gewerk.budget.stufe === "ueber" ? "vorbelegt mit der Überschreitung" : undefined} />
            <Feld label="Begründung" name="begruendung" pflicht breit hinweis="z. B. „Einsparung Rohbau nach Schlussrechnung“ – erscheint im Protokoll" />
          </div>
          <p className="hint">
            Höchstens das freie Budget der Quelle (Schätzung abzüglich Auftrag bzw. geprüftem Stand). „Einsparung“ = Gewerk ist vergeben, der Rest ist sicher frei; bei noch nicht vergebenen Gewerken
            wird Budget vorweggenommen. Das Gesamtbudget des Projekts bleibt gleich; korrigiert wird per Gegenbuchung.
          </p>
        </Formular>
      ) : (
        <p className="leer">Kein anderes Gewerk dieses Projekts hat freies Budget.</p>
      )}
    </details>
  );
}

/** Liste der Umbuchungen (optional nur die eines Gewerks). */
export function UmbuchungenListe({ liste, gewerkId, projektId }: { liste: Budgetumbuchung[]; gewerkId?: string; projektId: string }) {
  const eigene = gewerkId ? liste.filter((u) => u.von.id === gewerkId || u.nach.id === gewerkId) : liste;
  if (!eigene.length) return null;
  const link = (x: Budgetumbuchung["von"]) => (
    <a href={`/gewerke/${x.id}?projekt=${projektId}`}>
      {x.nr} {x.bezeichnung}
    </a>
  );
  return (
    <div className="karte ohne-innenabstand">
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Umbuchung</th>
            <th className="num">Betrag €</th>
            <th>Begründung</th>
            <th>von</th>
          </tr>
        </thead>
        <tbody>
          {eigene.map((u) => (
            <tr key={u.id}>
              <td>{deDatum(u.angelegtAm.slice(0, 10))}</td>
              <td className="umbuchung-weg">
                {link(u.von)} <ArrowRight size={13} /> {link(u.nach)}
              </td>
              <td className={`num${gewerkId ? (u.nach.id === gewerkId ? " positiv" : " negativ") : ""}`}>
                {gewerkId ? (u.nach.id === gewerkId ? "+" : "−") : ""}
                {deZahl(u.betrag)}
              </td>
              <td>{u.begruendung}</td>
              <td className="hint">{u.benutzer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
