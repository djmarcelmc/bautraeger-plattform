import { Feld, Gruppe } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import { partnerName, type Kostenkontrolle, type Partner } from "@/lib/typen";
import { Abweichung } from "../../kosten/Abweichung";
import { BudgetHinweisGewerk } from "../../kosten/Budget";
import { BudgetUmschichten, UmbuchungenListe, type Budgetumbuchung } from "../../kosten/Umbuchung";
import { gewerkAendern, vertragAnlegen } from "../../kosten/aktionen";
import { VertragFelder } from "../../kosten/VertragFelder";

export const dynamic = "force-dynamic";

export default async function GewerkSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ projekt?: string }> }) {
  const { id } = await params;
  const { projekt: projektId } = await searchParams;
  if (!projektId) return <p className="fehler">Projekt fehlt im Link.</p>;
  const [k, projekt, partner, umbuchungen] = await Promise.all([
    api<Kostenkontrolle>(`/projekte/${projektId}/kosten`),
    api<{ id: string; nr: number; suchcode: string }>(`/projekte/${projektId}`),
    api<Partner[]>("/partner"),
    api<Budgetumbuchung[]>(`/projekte/${projektId}/budgetumbuchungen`),
  ]);
  const g = k.gewerke.find((x) => x.id === id);
  if (!g) return <p className="fehler">Gewerk nicht gefunden.</p>;
  return (
    <>
      <p className="brotkrumen">
        <a href={`/projekte/${projekt.id}?reiter=kosten`}>
          {projekt.nr} {projekt.suchcode} › Kosten
        </a>{" "}
        ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>
            <span className="projektnr gross">{g.nr}</span> {g.bezeichnung}
          </h1>
          <p className="untertitel">{g.gruppe}</p>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Geschätzt</span>
          <b>{deZahl(g.stand.geschaetzt)} €</b>
        </div>
        <div className="kpi">
          <span>Vergeben inkl. Nachträge</span>
          <b>{deZahl(g.stand.summeVergeben)} €</b>
          <small>Nachträge {deZahl(g.stand.nachtraege)} €</small>
        </div>
        <div className="kpi">
          <span>Berechnet / bezahlt</span>
          <b>{deZahl(g.stand.berechnet)} €</b>
          <small>abgegolten {deZahl(g.stand.bezahlt)} €</small>
        </div>
        <div className="kpi">
          <span>Abweichung</span>
          <b>
            <Abweichung wert={g.stand.abweichung} /> €
          </b>
          <small>geschätzt − Trend</small>
        </div>
      </div>
      <BudgetHinweisGewerk b={g.budget} />
      <BudgetUmschichten projektId={projektId} gewerk={g} gewerke={k.gewerke} />
      {umbuchungen.some((u) => u.von.id === g.id || u.nach.id === g.id) ? <h2>Budgetumbuchungen</h2> : null}
      <UmbuchungenListe liste={umbuchungen} gewerkId={g.id} projektId={projektId} />
      <h2>Verträge</h2>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Handwerker</th>
              <th>Nr. intern</th>
              <th className="num">Auftragssumme €</th>
              <th>Rechnungen</th>
            </tr>
          </thead>
          <tbody>
            {g.vertraege.map((v) => (
              <tr key={v.id} className="klickbar">
                <td>
                  <a href={`/handwerkervertraege/${v.id}`} className="zeilenlink">
                    {v.handwerker ? partnerName({ firma: v.handwerker.firma, vorname: null, nachname: v.handwerker.nachname }) || v.handwerker.suchcode : "–"}
                  </a>
                </td>
                <td>{v.nrIntern}</td>
                <td className="num">{deZahl(v.vertragBrutto)}</td>
                <td>{v.offeneRechnungen ? <span className="badge warnung">{v.offeneRechnungen} offen</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!g.vertraege.length && <p className="leer">Noch nicht vergeben.</p>}
      </div>
      <h2>Auftrag vergeben</h2>
      <Formular aktion={vertragAnlegen} knopf="Vertrag anlegen">
        <VertragFelder gewerkId={g.id} handwerker={partner} />
      </Formular>
      <details className="karte">
        <summary>Gewerk bearbeiten</summary>
        <Formular aktion={gewerkAendern.bind(null, g.id)}>
          <Gruppe titel="Gewerk">
            <Feld label="Nr." name="nr" wert={g.nr} zahl pflicht />
            <Feld label="Bezeichnung" name="bezeichnung" wert={g.bezeichnung} pflicht />
            <Feld label="Gewerkegruppe" name="gruppe" wert={g.gruppe} />
            <Feld label="Geschätzt brutto €" name="geschaetztBrutto" wert={deZahl(g.geschaetztBrutto)} zahl />
          </Gruppe>
        </Formular>
      </details>
    </>
  );
}
