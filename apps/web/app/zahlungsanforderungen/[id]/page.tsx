import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type Anforderung, type Partner, type Rate, type VertragDetail } from "@/lib/typen";

export const dynamic = "force-dynamic";

interface Druckdaten extends Omit<Anforderung, "raten"> {
  raten: Rate[];
  vertrag: Pick<VertragDetail, "id" | "nr" | "urkundennr" | "datum" | "einheiten" | "summen">;
  projekt: VertragDetail["projekt"];
  gesellschaft: VertragDetail["gesellschaft"];
  empfaenger: Partner;
  kaeufer: Partner[];
  fruehere: Anforderung[];
}

/** Zahlungsanforderung als druckfertiges Schreiben (Browser-Druck → PDF). */
export default async function Zahlungsanforderung({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api<Druckdaten>(`/zahlungsanforderungen/${id}`);
  const e = a.empfaenger;
  const anrede = e.anrede === "Frau" ? `Sehr geehrte Frau ${e.nachname}` : e.anrede === "Herr" ? `Sehr geehrter Herr ${e.nachname}` : "Sehr geehrte Damen und Herren";
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href="/verkauf">Verkauf</a> › <a href={`/kaufvertraege/${a.vertrag.id}`}>{a.vertrag.nr}</a> ›
          </p>
          <h1>Zahlungsanforderung {a.rechnungsnr}</h1>
        </div>
        <DruckKnopf>
          <Printer size={16} /> Drucken / PDF
        </DruckKnopf>
      </div>
      <article className="schreiben">
        <header>
          <div className="absender">
            {a.gesellschaft.name}
            {a.gesellschaft.anschrift ? ` · ${a.gesellschaft.anschrift}` : ""}
          </div>
          <div className="empfaenger">
            {a.kaeufer.map((k) => (
              <div key={k.id}>{[k.anrede, partnerName(k)].filter(Boolean).join(" ")}</div>
            ))}
            {e.strasse ? <div>{e.strasse}</div> : null}
            {e.plz || e.ort ? <div>{[e.plz, e.ort].filter(Boolean).join(" ")}</div> : null}
          </div>
          <dl className="infoblock">
            <dt>Rechnungs-Nr.</dt>
            <dd>{a.rechnungsnr}</dd>
            <dt>Datum</dt>
            <dd>{deDatum(a.angefordertAm)}</dd>
            <dt>Kaufvertrag</dt>
            <dd>{a.vertrag.nr}</dd>
            {a.vertrag.urkundennr ? (
              <>
                <dt>UR-Nr.</dt>
                <dd>{a.vertrag.urkundennr}</dd>
              </>
            ) : null}
          </dl>
        </header>
        <h2>Zahlungsanforderung nach § 3 Abs. 2 MaBV</h2>
        <p className="betreff">
          Bauvorhaben {a.projekt.suchcode}
          {a.projekt.strasse ? `, ${a.projekt.strasse}` : ""}
          {a.projekt.ort ? `, ${[a.projekt.plz, a.projekt.ort].filter(Boolean).join(" ")}` : ""} –{" "}
          {a.vertrag.einheiten.map((x) => `${EINHEIT_TYP_TEXT[x.typ as keyof typeof EINHEIT_TYP_TEXT] ?? x.typ} ${x.nr}`).join(", ")}
        </p>
        <p>{anrede},</p>
        <p>
          gemäß dem Kaufvertrag {a.vertrag.urkundennr ? `(UR-Nr. ${a.vertrag.urkundennr}) ` : ""}
          {a.vertrag.datum ? `vom ${deDatum(a.vertrag.datum)} ` : ""}ist der folgende Bautenstand erreicht. Wir bitten um Zahlung der fälligen
          {a.raten.length > 1 ? " Raten" : " Rate"}:
        </p>
        <table className="druckliste">
          <thead>
            <tr>
              <th>Rate</th>
              <th>Bauabschnitt</th>
              <th className="num">%</th>
              <th className="num">Betrag €</th>
            </tr>
          </thead>
          <tbody>
            {a.raten.map((r) => (
              <tr key={r.id}>
                <td>{r.nr}</td>
                <td>{r.text}</td>
                <td className="num">{deZahl(r.prozent)}</td>
                <td className="num">{deZahl(r.betrag)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <b>Zahlbetrag</b>
              </td>
              <td className="num">
                <b>{deZahl(a.betrag)} €</b>
              </td>
            </tr>
          </tfoot>
        </table>
        <p>
          Bitte überweisen Sie den Betrag bis zum <b>{deDatum(a.faelligAm)}</b> unter Angabe der Rechnungsnummer <b>{a.rechnungsnr}</b>.
        </p>
        <table className="druckliste klein">
          <tbody>
            <tr>
              <td>Kaufpreis gesamt</td>
              <td className="num">{deZahl(a.vertrag.summen.vertragssumme)} €</td>
            </tr>
            <tr>
              <td>bisher angefordert (inkl. dieser Anforderung)</td>
              <td className="num">
                {deZahl(a.fruehere.reduce((s, x) => s + Number(x.betrag), 0) + Number(a.betrag))} €
              </td>
            </tr>
            <tr>
              <td>davon bezahlt</td>
              <td className="num">{deZahl(a.vertrag.summen.bezahlt)} €</td>
            </tr>
          </tbody>
        </table>
        <p>Mit freundlichen Grüßen</p>
        <p>{a.gesellschaft.name}</p>
      </article>
    </>
  );
}
