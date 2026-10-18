import { FESTSTELLUNG_ART_TEXT } from "@bt/domain";
import { CircleCheck, CircleX, ShieldCheck, TriangleAlert } from "lucide-react";
import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { MabvPruefbericht } from "@/lib/typen";

export const dynamic = "force-dynamic";

const ja = (b: boolean) => (b ? "ja" : "nein");

export default async function MabvPruefberichtSeite({
  searchParams,
}: {
  searchParams: Promise<{
    gesellschaft?: string;
    von?: string;
    bis?: string;
    jahr?: string;
  }>;
}) {
  const s = await searchParams;
  const jahr = s.jahr && /^\d{4}$/.test(s.jahr) ? s.jahr : undefined;
  const q = new URLSearchParams({
    ...(s.gesellschaft ? { gesellschaftId: s.gesellschaft } : {}),
    ...(jahr
      ? { von: `${jahr}-01-01`, bis: `${jahr}-12-31` }
      : { ...(s.von ? { von: s.von } : {}), ...(s.bis ? { bis: s.bis } : {}) }),
  });
  const d = await api<MabvPruefbericht>(`/auswertungen/mabv-pruefbericht?${q}`);
  const dieses = new Date().getFullYear();
  const link = (j: number) =>
    `?${new URLSearchParams({ ...(s.gesellschaft ? { gesellschaft: s.gesellschaft } : {}), jahr: String(j) })}`;
  return (
    <Bericht
      titel="MaBV-Prüfbericht"
      untertitel={`${d.gesellschaft.name} · Prüfungszeitraum ${deDatum(d.zeitraum.von)} – ${deDatum(d.zeitraum.bis)} · § 16 MaBV`}
      stand={d.erstelltAm}
      excel={`/auswertungen/excel/mabv-pruefbericht?${q}`}
      zurueck="MaBV-Prüfbericht"
      filter={
        <form className="filterleiste">
          <select name="gesellschaft" defaultValue={d.gesellschaft.id}>
            {d.gesellschaften.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nr} · {g.name}
              </option>
            ))}
          </select>
          <label className="inline">
            <span>von</span>
            <input type="date" name="von" defaultValue={d.zeitraum.von} />
          </label>
          <label className="inline">
            <span>bis</span>
            <input type="date" name="bis" defaultValue={d.zeitraum.bis} />
          </label>
          <button type="submit" className="zweitrangig">
            Anzeigen
          </button>
          <nav className="segment">
            {[dieses - 2, dieses - 1, dieses].map((j) => (
              <a
                key={j}
                href={link(j)}
                className={
                  d.zeitraum.von === `${j}-01-01` &&
                  d.zeitraum.bis === `${j}-12-31`
                    ? "aktiv"
                    : undefined
                }
              >
                {j}
              </a>
            ))}
          </nav>
        </form>
      }
    >
      <div className="kpis">
        <div className="kpi">
          <span>Kaufverträge</span>
          <b>{d.summen.vertraege}</b>
          <small>
            {d.summen.mitParagraph7} mit Sicherung nach § 7 ·{" "}
            {deZahl(d.summen.vertragssumme, 0)} €
          </small>
        </div>
        <div className="kpi">
          <span>Angefordert im Zeitraum</span>
          <b>{deZahl(d.summen.angefordertImZeitraum, 0)} €</b>
          <small>{d.summen.anforderungen} Zahlungsanforderungen</small>
        </div>
        <div className="kpi">
          <span>Eingegangen im Zeitraum</span>
          <b>{deZahl(d.summen.eingegangenImZeitraum, 0)} €</b>
          <small>Vermögenswerte der Erwerber</small>
        </div>
        <div className={`kpi${d.summen.verstoesse ? " kpi-warnung" : ""}`}>
          <span>Feststellungen</span>
          <b>{d.summen.verstoesse}</b>
          <small>Abweichungen · {d.summen.hinweise} Hinweise</small>
        </div>
      </div>

      {d.summen.vertraege > 0 && (
        <div className={`hinweisbox${d.summen.verstoesse ? "" : " erfolg"}`}>
          {d.summen.verstoesse ? (
            <TriangleAlert size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
          <div>
            {d.summen.verstoesse
              ? `${d.summen.verstoesse} mögliche Abweichung(en) von der MaBV laut Datenlage – bitte je Vertrag prüfen und ggf. begründen.`
              : "Nach Datenlage wurden alle Raten erst nach Fertigmeldung des Bautenstands und bei erfüllten Voraussetzungen bzw. ausreichender Sicherheit angefordert."}
          </div>
        </div>
      )}
      {!d.vertraege.length && (
        <div className="karte leer">
          Im gewählten Zeitraum gibt es keine Kaufverträge dieser Gesellschaft.
        </div>
      )}

      {d.vertraege.map((v) => (
        <section key={v.id} className="karte pruefvertrag">
          <div className="pruefkopf">
            <div>
              <h2>
                <a href={`/kaufvertraege/${v.id}`}>{v.nr}</a> ·{" "}
                {v.kaeufer.join(", ")}
              </h2>
              <p className="hint">
                {v.projekt.nr} {v.projekt.suchcode} · Einheiten{" "}
                {v.einheiten.join(", ")} · Vertrag vom {deDatum(v.datum) || "–"}
                {v.urkundennr ? ` · ${v.urkundennr}` : ""} · Vertragssumme{" "}
                {deZahl(v.vertragssumme)} €
              </p>
            </div>
            {v.verstoesse ? (
              <span className="badge gefahr">
                {v.verstoesse} Abweichung(en)
              </span>
            ) : (
              <span className="badge gut">ohne Abweichung</span>
            )}
          </div>
          <p className="sicherung">
            <b>Sicherung {v.sicherung.art}:</b>{" "}
            {v.sicherung.art === "§ 3"
              ? `Vertrag wirksam: ${ja(v.sicherung.vertragWirksam)} · Vormerkung eingetragen: ${deDatum(v.sicherung.vormerkungEingetragenAm) || "nein"} · Lastenfreistellung gesichert: ${ja(v.sicherung.lastenfreistellungGesichert)}`
              : v.sicherung.buergschaften.length
                ? v.sicherung.buergschaften
                    .map(
                      (b) =>
                        `${b.buerge ?? "Bürgschaft"} ${b.nr ?? ""} über ${deZahl(b.betrag)} € (ausgestellt ${deDatum(b.ausgestelltAm) || "?"}${b.rueckgabeAm ? `, zurück ${deDatum(b.rueckgabeAm)}` : ""})`,
                    )
                    .join("; ")
                : "keine Bürgschaft erfasst"}
          </p>
          {v.anforderungen.length ? (
            <div className="tabellenrahmen">
              <table className="berichtstabelle eng">
                <thead>
                  <tr>
                    <th>Rechnung</th>
                    <th>angefordert</th>
                    <th>
                      Raten · Bauabschnitte (für alle Einheiten fertig gemeldet
                      am)
                    </th>
                    <th className="num">Betrag €</th>
                    <th className="num">kumuliert €</th>
                    <th>MaBV</th>
                  </tr>
                </thead>
                <tbody>
                  {v.anforderungen.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <a href={`/zahlungsanforderungen/${a.id}`}>
                          {a.rechnungsnr}
                        </a>
                      </td>
                      <td>{deDatum(a.angefordertAm)}</td>
                      <td>
                        {a.raten.map((r) => (
                          <div key={r.nr}>
                            <b>Rate {r.nr}</b>
                            {r.prozent
                              ? ` (${deZahl(r.prozent, 2)} %)`
                              : ""}:{" "}
                            {r.abschnitte.map((x, i) => (
                              <span
                                key={x.key}
                                className={x.rechtzeitig ? undefined : "minus"}
                              >
                                {i ? "; " : ""}
                                {x.text} –{" "}
                                {x.fertigAm
                                  ? deDatum(x.fertigAm)
                                  : "nicht gemeldet"}
                              </span>
                            ))}
                            {r.typ !== "mabv" ? (
                              <span className="hint"> ({r.typ})</span>
                            ) : null}
                          </div>
                        ))}
                      </td>
                      <td className="num">{deZahl(a.betrag)}</td>
                      <td className="num">{deZahl(a.kumuliert)}</td>
                      <td>
                        {a.ordnungsgemaess ? (
                          <CircleCheck
                            size={16}
                            className="plus"
                            aria-label="ordnungsgemäß"
                          />
                        ) : (
                          <CircleX
                            size={16}
                            className="minus"
                            aria-label="Abweichung"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">Keine Zahlungsanforderungen im Zeitraum.</p>
          )}
          <p className="hint">
            Zahlungseingänge im Zeitraum:{" "}
            {v.eingaenge.length
              ? v.eingaenge
                  .map((e) => `${deDatum(e.datum)} ${deZahl(e.betrag)} €`)
                  .join(" · ")
              : "keine"}{" "}
            · Stand {deDatum(d.zeitraum.bis)}: angefordert{" "}
            {deZahl(v.summen.angefordertBisEnde)} €, eingegangen{" "}
            {deZahl(v.summen.eingegangenBisEnde)} €
          </p>
          {v.feststellungen.length > 0 && (
            <ul className="feststellungen">
              {v.feststellungen.map((f, i) => (
                <li key={i} className={f.schwere}>
                  <span
                    className={`badge ${f.schwere === "verstoss" ? "gefahr" : "warnung"}`}
                  >
                    {f.schwere === "verstoss" ? "Abweichung" : "Hinweis"}
                  </span>{" "}
                  <b>{FESTSTELLUNG_ART_TEXT[f.art]}</b>
                  {f.rechnungsnr ? ` · ${f.rechnungsnr}` : ""}: {f.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="hint">
        Prüfhilfe für die Prüfung nach § 16 MaBV auf Grundlage der in der
        Plattform erfassten Daten (Ratenplan, Bautenstandsmeldungen,
        Zahlungsanforderungen und -eingänge, Vormerkung, Bürgschaften). Nicht
        automatisch geprüft werden u. a. Baugenehmigung, Inhalt der
        Freistellungserklärung und Verwendung der Mittel (§ 4 MaBV). Die
        Würdigung obliegt dem Prüfer.
      </p>
    </Bericht>
  );
}
