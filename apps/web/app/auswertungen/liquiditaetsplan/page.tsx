import { TriangleAlert } from "lucide-react";
import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Liquiditaetsplan, ProjektListe } from "@/lib/typen";
import { LiquiditaetsDiagramm } from "./Diagramm";

export const dynamic = "force-dynamic";

const KURZ: Record<string, string> = {
  angefordert: "angefordert",
  anforderbar: "anforderbar",
  raten: "Raten (Plan)",
  verkauf: "Verkauf (Annahme)",
  rechnungen: "Rechnungen",
  bauleistung: "Abschläge",
  ohnePlan: "ohne Vorgang",
  schlusszahlung: "Schlusszahlung",
  gewaehrleistung: "GW-Einbehalt",
};

export default async function LiquiditaetsplanSeite({
  searchParams,
}: {
  searchParams: Promise<{ projekt?: string; wochen?: string; anfangsbestand?: string; unverkauft?: string; ohneSkonto?: string }>;
}) {
  const s = await searchParams;
  const q = new URLSearchParams({
    ...(s.projekt ? { projektId: s.projekt } : {}),
    wochen: s.wochen ?? "26",
    ...(s.anfangsbestand ? { anfangsbestand: s.anfangsbestand } : {}),
    ...(s.unverkauft ? { unverkauft: "1" } : {}),
    ...(s.ohneSkonto ? { skonto: "0" } : {}),
  });
  const [d, projekte] = await Promise.all([api<Liquiditaetsplan>(`/auswertungen/liquiditaetsplan?${q}`), api<ProjektListe[]>("/projekte")]);
  const { ein, aus } = d.arten;
  const titelProjekt = s.projekt && d.projekte[0] ? `${d.projekte[0].nr} ${d.projekte[0].suchcode}` : "alle laufenden Projekte";
  const n = (v: string | undefined) => (v && Number(v) ? deZahl(v, 0) : "");
  const ohnePlan = d.projekte.filter((p) => !p.hatPlan);
  const negativ = Number(d.tiefstand.bestand) < 0;
  return (
    <Bericht
      titel="Liquiditätsplan"
      untertitel={`${titelProjekt} · ${d.wochen.length} Wochen ab KW ${d.wochen[0]!.woche}/${d.wochen[0]!.jahr}`}
      stand={d.stichtag}
      excel={`/auswertungen/excel/liquiditaetsplan?${q}`}
      zurueck="Liquiditätsplan"
      filter={
        <form className="filterleiste">
          <select name="projekt" defaultValue={s.projekt ?? ""}>
            <option value="">Alle laufenden Projekte</option>
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nr} {p.suchcode}
              </option>
            ))}
          </select>
          <select name="wochen" defaultValue={s.wochen ?? "26"}>
            {[13, 26, 52, 78, 104].map((w) => (
              <option key={w} value={w}>
                {w} Wochen
              </option>
            ))}
          </select>
          <input name="anfangsbestand" defaultValue={s.anfangsbestand ?? ""} placeholder="Anfangsbestand €" inputMode="decimal" className="zahl" aria-label="Anfangsbestand" />
          <label className="haken">
            <input type="checkbox" name="unverkauft" value="1" defaultChecked={!!s.unverkauft} /> unverkaufte Einheiten einrechnen
          </label>
          <label className="haken">
            <input type="checkbox" name="ohneSkonto" value="1" defaultChecked={!!s.ohneSkonto} /> ohne Skonto rechnen
          </label>
          <button type="submit" className="zweitrangig">
            Anzeigen
          </button>
        </form>
      }
    >
      <div className="kpis">
        <div className="kpi">
          <span>Einnahmen im Zeitraum</span>
          <b className="plus">{deZahl(d.summe.ein, 0)} €</b>
          <small>davon überfällig {deZahl(d.ueberfaellig.ein, 0)} €</small>
        </div>
        <div className="kpi">
          <span>Ausgaben im Zeitraum</span>
          <b className="minus">{deZahl(d.summe.aus, 0)} €</b>
          <small>Anfangsbestand {deZahl(d.anfangsbestand, 0)} €</small>
        </div>
        <div className="kpi">
          <span>Bestand am Ende</span>
          <b>{deZahl(d.summe.endbestand, 0)} €</b>
          <small>KW {d.wochen.at(-1)!.woche}/{d.wochen.at(-1)!.jahr}</small>
        </div>
        <div className={`kpi${negativ ? " kpi-warnung" : ""}`}>
          <span>Tiefststand</span>
          <b>{deZahl(d.tiefstand.bestand, 0)} €</b>
          <small>{d.tiefstand.woche ? `in KW ${d.tiefstand.woche.woche}/${d.tiefstand.woche.jahr}` : "zu Beginn"}{negativ ? " – Finanzierungsbedarf" : ""}</small>
        </div>
      </div>

      {ohnePlan.length ? (
        <div className="hinweisbox nur-bildschirm">
          <TriangleAlert size={16} />
          <div>
            <b>Ohne Bauzeitenplan:</b>{" "}
            {ohnePlan.map((p, i) => (
              <span key={p.id}>
                {i ? ", " : ""}
                <a href={`/projekte/${p.id}?reiter=bauzeit`}>
                  {p.nr} {p.suchcode}
                </a>
              </span>
            ))}
            . Raten und Kosten dieser Projekte haben keinen Termin und erscheinen nur unter „ohne Termin“.
          </div>
        </div>
      ) : null}

      <div className="karte diagrammkarte">
        <LiquiditaetsDiagramm wochen={d.wochen} anfangsbestand={d.anfangsbestand} />
        <p className="hint diagrammlegende">
          <i className="ein" /> Einnahmen <i className="aus" /> Ausgaben <i className="bestand" /> Bestand (kumuliert)
        </p>
      </div>

      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng liqtabelle">
          <thead>
            <tr className="obergruppe">
              <th colSpan={2} />
              <th colSpan={ein.length + 1} className="trenner">
                Einnahmen
              </th>
              <th colSpan={aus.length + 1} className="trenner">
                Ausgaben
              </th>
              <th colSpan={2} className="trenner" />
            </tr>
            <tr>
              <th>KW</th>
              <th>Zeitraum</th>
              {ein.map((a, i) => (
                <th key={a} className={`num${i === 0 ? " trenner" : ""}`} title={d.artText.ein[a]}>
                  {KURZ[a] ?? a}
                </th>
              ))}
              <th className={`num${ein.length ? "" : " trenner"}`}>Summe</th>
              {aus.map((a, i) => (
                <th key={a} className={`num${i === 0 ? " trenner" : ""}`} title={d.artText.aus[a]}>
                  {KURZ[a] ?? a}
                </th>
              ))}
              <th className={`num${aus.length ? "" : " trenner"}`}>Summe</th>
              <th className="num trenner">Saldo</th>
              <th className="num">Bestand</th>
            </tr>
          </thead>
          <tbody>
            {d.wochen.map((w) => (
              <tr key={w.von} className={Number(w.bestand) < 0 ? "unterdeckung" : undefined}>
                <td>
                  <b>{w.woche}</b>
                  <span className="hint">/{String(w.jahr).slice(2)}</span>
                </td>
                <td className="hint">
                  {deDatum(w.von).slice(0, 6)}–{deDatum(w.bis).slice(0, 6)}
                </td>
                {ein.map((a, i) => (
                  <td key={a} className={`num${i === 0 ? " trenner" : ""}`}>
                    {n(w.ein[a])}
                  </td>
                ))}
                <td className={`num fett${ein.length ? "" : " trenner"}`}>{n(w.einSumme)}</td>
                {aus.map((a, i) => (
                  <td key={a} className={`num${i === 0 ? " trenner" : ""}`}>
                    {n(w.aus[a])}
                  </td>
                ))}
                <td className={`num fett${aus.length ? "" : " trenner"}`}>{n(w.ausSumme)}</td>
                <td className={`num trenner ${Number(w.saldo) < 0 ? "minus" : Number(w.saldo) > 0 ? "plus" : ""}`}>{deZahl(w.saldo, 0)}</td>
                <td className={`num fett${Number(w.bestand) < 0 ? " minus" : ""}`}>{deZahl(w.bestand, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="summenzeile">
              <td colSpan={2}>Summe</td>
              {ein.map((a, i) => (
                <td key={a} className={`num${i === 0 ? " trenner" : ""}`}>
                  {deZahl(d.wochen.reduce((x, w) => x + Number(w.ein[a] ?? 0), 0), 0)}
                </td>
              ))}
              <td className={`num${ein.length ? "" : " trenner"}`}>{deZahl(d.summe.ein, 0)}</td>
              {aus.map((a, i) => (
                <td key={a} className={`num${i === 0 ? " trenner" : ""}`}>
                  {deZahl(d.wochen.reduce((x, w) => x + Number(w.aus[a] ?? 0), 0), 0)}
                </td>
              ))}
              <td className={`num${aus.length ? "" : " trenner"}`}>{deZahl(d.summe.aus, 0)}</td>
              <td className="num trenner">{deZahl(Number(d.summe.ein) - Number(d.summe.aus), 0)}</td>
              <td className="num">{deZahl(d.summe.endbestand, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="zweispaltig">
        <section className="karte">
          <h2>Einbehalte und Skonto</h2>
          <table className="berichtstabelle eng">
            <tbody>
              <tr>
                <td>Vertragserfüllungseinbehalte (derzeit einbehalten)</td>
                <td className="num">{deZahl(d.einbehalte.einbehaltenBisher, 0)} €</td>
              </tr>
              <tr>
                <td>Gewährleistungseinbehalte (bis Ende der Gewährleistung)</td>
                <td className="num">{deZahl(d.einbehalte.gewaehrleistung, 0)} €</td>
              </tr>
              <tr>
                <td>{d.skonto ? "Skontoertrag (eingerechnet)" : "möglicher Skontoertrag (nicht eingerechnet)"}</td>
                <td className="num plus">{deZahl(d.einbehalte.skontoErsparnis, 0)} €</td>
              </tr>
            </tbody>
          </table>
          <p className="hint">Einbehalte, die durch eine Bürgschaft abgelöst sind, werden mit der Schlusszahlung ausgezahlt.</p>
        </section>
        <section className="karte">
          <h2>Außerhalb des Zeitraums</h2>
          <table className="berichtstabelle eng">
            <thead>
              <tr>
                <th />
                <th className="num">Einnahmen</th>
                <th className="num">Ausgaben</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>nach KW {d.wochen.at(-1)!.woche}/{d.wochen.at(-1)!.jahr}</td>
                <td className="num">{deZahl(d.spaeter.ein, 0)}</td>
                <td className="num">{deZahl(d.spaeter.aus, 0)}</td>
              </tr>
              <tr>
                <td>ohne Termin</td>
                <td className="num">{deZahl(d.ohneTermin.ein, 0)}</td>
                <td className="num">{deZahl(d.ohneTermin.aus, 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="karte">
          <h2>So wird gerechnet</h2>
          <ul className="hint erklaerung">
            <li>Angeforderte Raten: offener Betrag zum Fälligkeitsdatum, Überfälliges in der ersten Woche.</li>
            <li>Raten mit gemeldetem Bautenstand: heute + Zahlungsziel des Kaufvertrags.</li>
            <li>Übrige MaBV-Raten: Meilenstein aus dem Bauzeitenplan + Zahlungsziel.</li>
            <li>Unverkaufte Einheiten (optional): Listenpreis nach Standard-MaBV-Raten.</li>
            <li>Kosten: geprüfte, noch offene Rechnungen sofort; der noch nicht berechnete Teil des Trends gleichmäßig über die Dauer der verknüpften Vorgänge.</li>
            <li>Vergebene Gewerke nach der Prüfkette des Vertrags: abzüglich Nachlass, Umlagen, Vertragserfüllungseinbehalt und – sofern vereinbart – Skonto. Die Bauabzugsteuer bleibt ein Abfluss (ans Finanzamt).</li>
            <li>Schlusszahlung: Freigabe des Vertragserfüllungs- bis auf den Gewährleistungseinbehalt, Abnahme (sonst Ende der Vorgänge) + Zahlungsfrist bzw. 30 Tage.</li>
            <li>Gewährleistungseinbehalt: nach Ablauf der Gewährleistung (Vertrag, sonst 5 Jahre); durch Bürgschaft abgelöste Einbehalte fließen schon mit der Schlusszahlung ab.</li>
          </ul>
        </section>
      </div>
    </Bericht>
  );
}
