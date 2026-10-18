import { Banknote, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Zahlungsvorschlag, ZahlungslaufListe } from "@/lib/typen";
import { zahlungslaufAnlegen } from "./aktionen";
import { Auswahlsumme } from "./Auswahl";

export const dynamic = "force-dynamic";

export default async function Zahlungslaeufe({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const { datum } = await searchParams;
  const heute = new Date().toISOString().slice(0, 10);
  const [v, laeufe] = await Promise.all([
    api<Zahlungsvorschlag>(`/zahlungslaeufe/vorschlag${datum && datum >= heute ? `?ausfuehrungAm=${datum}` : ""}`),
    api<ZahlungslaufListe[]>("/zahlungslaeufe"),
  ]);
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Zahlungsläufe</h1>
          <p className="untertitel">Freigegebene Handwerkerrechnungen als SEPA-Sammelüberweisung (pain.001) für das Onlinebanking – Skonto und Bauabzugsteuer sind eingerechnet.</p>
        </div>
      </div>
      <form className="filterleiste">
        <label className="inline">
          <span>Ausführung am</span>
          <input type="date" name="datum" defaultValue={v.ausfuehrungAm} min={heute} />
        </label>
        <button type="submit" className="zweitrangig">
          Neu berechnen
        </button>
      </form>

      {!v.gesellschaften.length && (
        <div className="karte leer">
          <Banknote size={22} /> Keine freigegebenen Rechnungen offen. Rechnungen werden unter <a href="/kosten?reiter=freigeben">Kosten → Freizugeben</a> freigegeben.
        </div>
      )}

      {v.gesellschaften.map((gr) => {
        const formId = `lauf-${gr.gesellschaft.id}`;
        const start = gr.rechnungen.filter((r) => r.zahlbar).reduce((s, r) => s + Number(r.auszahlung), 0);
        return (
          <section key={gr.gesellschaft.id} className="karte ohne-innenabstand zahlungsgruppe">
            <Formular aktion={zahlungslaufAnlegen} knopf={null} className="formular">
              <input type="hidden" name="ausfuehrungAm" value={v.ausfuehrungAm} />
              <div className="gruppenkopf">
                <div>
                  <h2>{gr.gesellschaft.name}</h2>
                  <p className="hint">
                    {gr.gesellschaft.kontoOk ? `Auftraggeberkonto ${gr.gesellschaft.iban!.replace(/(.{4})/g, "$1 ")}` : "Keine gültige IBAN hinterlegt"}
                  </p>
                </div>
                {!gr.gesellschaft.kontoOk && (
                  <a className="badge gefahr" href={`/gesellschaften/${gr.gesellschaft.id}`}>
                    IBAN in der Gesellschaft hinterlegen
                  </a>
                )}
              </div>
              <table id={formId}>
                <thead>
                  <tr>
                    <th />
                    <th>Rechnung</th>
                    <th>Handwerker</th>
                    <th>Projekt / Gewerk</th>
                    <th>fällig</th>
                    <th className="num">Skonto</th>
                    <th className="num">Bauabzug</th>
                    <th className="num">Überweisung €</th>
                  </tr>
                </thead>
                <tbody>
                  {gr.rechnungen.map((r) => (
                    <tr key={r.id} className={r.zahlbar ? undefined : "gesperrt"}>
                      <td>
                        <input type="checkbox" name="rechnungIds" value={r.id} defaultChecked={r.zahlbar} disabled={!r.zahlbar || !gr.gesellschaft.kontoOk} data-betrag={r.auszahlung} aria-label={`Rechnung ${r.rechnungsnr} auswählen`} />
                      </td>
                      <td>
                        <a href={`/eingangsrechnungen/${r.id}`}>{r.rechnungsnr}</a>
                        <div className="hint">{deDatum(r.rechnungsdatum)}</div>
                      </td>
                      <td>
                        {r.handwerker.name}
                        <div className="hint">{r.handwerker.iban ? r.handwerker.iban.replace(/(.{4})/g, "$1 ") : "ohne IBAN"}</div>
                      </td>
                      <td>
                        {r.projekt.nr} {r.projekt.suchcode}
                        <div className="hint">{r.gewerk}</div>
                      </td>
                      <td>
                        {deDatum(r.faelligAm)}
                        {r.skontoMoeglich && r.skontoFristBis ? <div className="hint plus">Skonto bis {deDatum(r.skontoFristBis)}</div> : null}
                      </td>
                      <td className="num">{Number(r.skonto) ? deZahl(r.skonto) : ""}</td>
                      <td className="num">{Number(r.bauabzugsteuer) ? deZahl(r.bauabzugsteuer) : ""}</td>
                      <td className="num fett">
                        {deZahl(r.auszahlung)}
                        {r.hinweise.length ? (
                          <div className="hinweise">
                            {r.hinweise.map((h) => (
                              <span key={h} className="hint warnung">
                                <TriangleAlert size={12} /> {h}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="gruppenfuss">
                <Auswahlsumme formId={formId} start={start} />
                <button type="submit" disabled={!gr.gesellschaft.kontoOk}>
                  <Banknote size={16} /> Zahlungslauf erstellen
                </button>
              </div>
            </Formular>
          </section>
        );
      })}
      <p className="hint">
        Beim Erstellen werden die Zahlungen mit dem Ausführungsdatum verbucht und die Rechnungen auf „bezahlt“ gesetzt. Die SEPA-Datei lädst du anschließend herunter und reichst sie im Onlinebanking ein.
      </p>

      <h2>Bisherige Zahlungsläufe</h2>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Gesellschaft</th>
              <th>Ausführung</th>
              <th className="num">Zahlungen</th>
              <th className="num">Summe €</th>
              <th>erstellt</th>
            </tr>
          </thead>
          <tbody>
            {laeufe.map((l) => (
              <tr key={l.id} className="klickbar">
                <td>
                  <a href={`/zahlungslaeufe/${l.id}`} className="zeilenlink">
                    {l.nr}
                  </a>
                </td>
                <td>{l.gesellschaft}</td>
                <td>{deDatum(l.ausfuehrungAm)}</td>
                <td className="num">{l.anzahl}</td>
                <td className="num">{deZahl(l.summe)}</td>
                <td className="hint">
                  {deDatum(l.angelegtAm)} · {l.erstelltVon}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!laeufe.length && <p className="leer">Noch keine Zahlungsläufe.</p>}
      </div>
    </>
  );
}
