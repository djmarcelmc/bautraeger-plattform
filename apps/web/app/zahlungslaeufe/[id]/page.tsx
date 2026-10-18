import { Download, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { ZahlungslaufDetail } from "@/lib/typen";

export const dynamic = "force-dynamic";

export default async function ZahlungslaufSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await api<ZahlungslaufDetail>(`/zahlungslaeufe/${id}`);
  return (
    <>
      <p className="brotkrumen">
        <a href="/zahlungslaeufe">Zahlungsläufe</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>Zahlungslauf {l.nr}</h1>
          <p className="untertitel">
            {l.gesellschaft.name} · Ausführung {deDatum(l.ausfuehrungAm)} · erstellt {deDatum(l.angelegtAm)} von {l.erstelltVon}
          </p>
        </div>
        <div className="aktionen">
          <a className="knopf" href={`/zahlungslaeufe/${id}/xml`}>
            <Download size={16} /> SEPA-Datei herunterladen
          </a>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Überweisungen</span>
          <b>{deZahl(l.summe)} €</b>
          <small>{l.anzahl} {l.anzahl === 1 ? "Zahlung" : "Zahlungen"} · pain.001.001.09</small>
        </div>
        <div className="kpi">
          <span>Auftraggeberkonto</span>
          <b className="klein">{l.gesellschaft.iban?.replace(/(.{4})/g, "$1 ")}</b>
          <small>{l.gesellschaft.bic ?? "ohne BIC"}</small>
        </div>
        <div className="kpi">
          <span>Skonto genutzt</span>
          <b className="plus">{deZahl(l.skonto)} €</b>
          <small>innerhalb der Skontofrist</small>
        </div>
        <div className={`kpi${Number(l.bauabzugsteuer.summe) ? " kpi-warnung" : ""}`}>
          <span>Bauabzugsteuer einbehalten</span>
          <b>{deZahl(l.bauabzugsteuer.summe)} €</b>
          <small>{l.bauabzugsteuer.faelligAm ? `bis ${deDatum(l.bauabzugsteuer.faelligAm)} anmelden und abführen` : "keine"}</small>
        </div>
      </div>
      {Number(l.bauabzugsteuer.summe) > 0 && (
        <div className="hinweisbox">
          <Landmark size={16} />
          <div>
            Die einbehaltene <b>Bauabzugsteuer von {deZahl(l.bauabzugsteuer.summe)} €</b> ist bis zum {deDatum(l.bauabzugsteuer.faelligAm)} beim für den Handwerker zuständigen Finanzamt
            anzumelden und abzuführen (§ 48a EStG); der Handwerker erhält eine Abrechnung.
          </div>
        </div>
      )}
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Rechnung</th>
              <th>Empfänger</th>
              <th>Projekt / Gewerk</th>
              <th className="num">Skonto</th>
              <th className="num">Bauabzug</th>
              <th className="num">Überweisung €</th>
            </tr>
          </thead>
          <tbody>
            {l.zahlungen.map((z) => (
              <tr key={z.rechnungId}>
                <td>
                  <a href={`/eingangsrechnungen/${z.rechnungId}`}>{z.rechnungsnr}</a>
                </td>
                <td>
                  {z.handwerker}
                  <div className="hint">{z.iban?.replace(/(.{4})/g, "$1 ")}</div>
                </td>
                <td>
                  {z.projekt}
                  <div className="hint">{z.gewerk}</div>
                </td>
                <td className="num">{Number(z.skonto) ? deZahl(z.skonto) : ""}</td>
                <td className="num">{Number(z.bauabzugsteuer) ? deZahl(z.bauabzugsteuer) : ""}</td>
                <td className="num fett">{deZahl(z.betrag)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="summenzeile">
              <td colSpan={3}>Summe</td>
              <td className="num">{deZahl(l.skonto)}</td>
              <td className="num">{deZahl(l.bauabzugsteuer.summe)}</td>
              <td className="num">{deZahl(l.summe)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">
        Vor dem ersten produktiven Einsatz bitte einmal mit der Bank testen: Die Datei folgt der DK-Spezifikation (pain.001.001.09); manche Banken verlangen zusätzlich den BIC des
        Auftraggebers.
      </p>
    </>
  );
}
