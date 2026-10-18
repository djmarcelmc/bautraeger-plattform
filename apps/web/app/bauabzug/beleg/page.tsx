import type { BauabzugStatus } from "@bt/domain";
import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type Gesellschaft, type Partner } from "@/lib/typen";

export const dynamic = "force-dynamic";

interface Beleg {
  monat: string;
  monatText: string;
  faelligAm: string;
  gesellschaft: Gesellschaft;
  handwerker: Partner;
  gegenleistung: string;
  abzugsbetrag: string;
  status: BauabzugStatus;
  anmeldung: { angemeldetAm: string; abgefuehrtAm: string | null } | null;
  zahlungen: { datum: string; betrag: string; bauabzugsteuer: string; rechnungsnr: string; rechnungsdatum: string; schlussrechnung: boolean; projekt: string; gewerk: string }[];
}

/** Abrechnungsbeleg für den Leistenden (§ 48a Abs. 2 EStG) und Angaben für die Anmeldung. */
export default async function BauabzugBeleg({ searchParams }: { searchParams: Promise<{ gesellschaftId?: string; handwerkerId?: string; monat?: string }> }) {
  const q = await searchParams;
  const b = await api<Beleg>(`/bauabzug/beleg?${new URLSearchParams({ gesellschaftId: q.gesellschaftId ?? "", handwerkerId: q.handwerkerId ?? "", monat: q.monat ?? "" })}`);
  const h = b.handwerker;
  const anschriftHw = [h.strasse, [h.plz, h.ort].filter(Boolean).join(" ")].filter(Boolean);
  const e = (v: string) => `${deZahl(v, 2)} €`;
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href="/bauabzug">Bauabzugsteuer</a> ›
          </p>
          <h1>Abrechnungsbeleg {b.monatText}</h1>
          <p className="untertitel">{partnerName(h)} · für den Handwerker und die eigenen Unterlagen</p>
        </div>
        <DruckKnopf>
          <Printer size={16} /> Drucken / PDF
        </DruckKnopf>
      </div>

      <section className="karte nur-bildschirm anmeldedaten">
        <h2>Angaben für die Anmeldung (ELSTER)</h2>
        <p className="hint">
          Formular „Anmeldung über den Steuerabzug bei Bauleistungen“, abzugeben bis {deDatum(b.faelligAm)} beim Finanzamt des Leistenden; der Abzugsbetrag ist bis dahin dorthin zu
          überweisen.
        </p>
        <dl className="datenliste">
          <dt>Finanzamt (des Leistenden)</dt>
          <dd>{h.finanzamt ?? <span className="warntext">fehlt – in den Partnerdaten ergänzen</span>}</dd>
          <dt>Steuernummer des Leistenden</dt>
          <dd>{h.steuernummer ?? <span className="warntext">fehlt – in den Partnerdaten ergänzen</span>}</dd>
          <dt>Leistender</dt>
          <dd>{[partnerName(h), ...anschriftHw].join(", ")}</dd>
          <dt>Leistungsempfänger</dt>
          <dd>
            {b.gesellschaft.name}
            {b.gesellschaft.anschrift ? `, ${b.gesellschaft.anschrift}` : ""}
          </dd>
          <dt>Steuernummer Leistungsempfänger</dt>
          <dd>{b.gesellschaft.steuernummer ?? <span className="warntext">fehlt – bei der Gesellschaft ergänzen</span>}</dd>
          <dt>Anmeldungszeitraum</dt>
          <dd>{b.monatText}</dd>
          <dt>Gegenleistung (brutto)</dt>
          <dd>{e(b.gegenleistung)}</dd>
          <dt>Abzugsbetrag (15 %)</dt>
          <dd>
            <b>{e(b.abzugsbetrag)}</b>
          </dd>
        </dl>
      </section>

      <article className="schreiben">
        <header>
          <div className="absender">
            {b.gesellschaft.name}
            {b.gesellschaft.anschrift ? ` · ${b.gesellschaft.anschrift}` : ""}
          </div>
          <div className="empfaenger">
            <div>{partnerName(h)}</div>
            {anschriftHw.map((z) => (
              <div key={z}>{z}</div>
            ))}
          </div>
          <dl className="infoblock">
            <dt>Datum</dt>
            <dd>{deDatum(new Date().toISOString().slice(0, 10))}</dd>
            <dt>Zeitraum</dt>
            <dd>{b.monatText}</dd>
            {h.steuernummer ? (
              <>
                <dt>Ihre St.-Nr.</dt>
                <dd>{h.steuernummer}</dd>
              </>
            ) : null}
          </dl>
        </header>
        <h2>Abrechnung über den Steuerabzug bei Bauleistungen</h2>
        <p className="betreff">nach § 48a Abs. 2 EStG – Zahlungen im {b.monatText}</p>
        <p>
          Sehr geehrte Damen und Herren, für Ihre Leistungen lag uns zum Zeitpunkt der Zahlung keine gültige Freistellungsbescheinigung nach § 48b EStG vor. Wir haben daher 15 % der
          Gegenleistung einbehalten und für Ihre Rechnung an Ihr Finanzamt angemeldet und abgeführt:
        </p>
        <table className="druckliste belegliste">
          <thead>
            <tr>
              <th>Rechnung vom</th>
              <th>Bauvorhaben / Gewerk</th>
              <th>Zahlungstag</th>
              <th className="num">Gegenleistung</th>
              <th className="num">Steuerabzug</th>
              <th className="num">ausgezahlt</th>
            </tr>
          </thead>
          <tbody>
            {b.zahlungen.map((z, i) => (
              <tr key={i}>
                <td>
                  {z.rechnungsnr}
                  {z.schlussrechnung ? " (Schlussrechnung)" : ""}
                  <div className="klein">{deDatum(z.rechnungsdatum)}</div>
                </td>
                <td>
                  {z.projekt} / {z.gewerk}
                </td>
                <td>{deDatum(z.datum)}</td>
                <td className="num">{deZahl(Number(z.betrag) + Number(z.bauabzugsteuer), 2)}</td>
                <td className="num">{deZahl(z.bauabzugsteuer, 2)}</td>
                <td className="num">{deZahl(z.betrag, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Summe</td>
              <td className="num">{deZahl(b.gegenleistung, 2)}</td>
              <td className="num">{deZahl(b.abzugsbetrag, 2)}</td>
              <td className="num">{deZahl(Number(b.gegenleistung) - Number(b.abzugsbetrag), 2)}</td>
            </tr>
          </tfoot>
        </table>
        <p>
          Der Abzugsbetrag von <b>{e(b.abzugsbetrag)}</b> wurde beim Finanzamt <b>{h.finanzamt ?? "…………………………"}</b>
          {h.steuernummer ? ` (Ihre Steuernummer ${h.steuernummer})` : ""} angemeldet
          {b.anmeldung ? ` am ${deDatum(b.anmeldung.angemeldetAm)}` : ""}
          {b.anmeldung?.abgefuehrtAm ? ` und am ${deDatum(b.anmeldung.abgefuehrtAm)} abgeführt` : ""}. Er wird auf Ihre Steuern angerechnet (§ 48c EStG). Bitte bewahren Sie diese
          Abrechnung für Ihre Unterlagen auf.
        </p>
        <p>
          Sobald Sie uns eine gültige Freistellungsbescheinigung vorlegen, zahlen wir künftig ohne Abzug.
        </p>
        <p>Mit freundlichen Grüßen</p>
        <p>{b.gesellschaft.name}</p>
      </article>
    </>
  );
}
