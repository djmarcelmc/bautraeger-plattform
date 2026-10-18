import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Mail, Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { PdfKnopf } from "@/components/PdfKnopf";
import { briefbogenFuer, type Briefbogen } from "@/lib/briefbogen";
import { PerMailSenden } from "@/components/PerMailSenden";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type MahnungDruck } from "@/lib/typen";

export const dynamic = "force-dynamic";

/** Mahnschreiben (eine oder mehrere) zum Drucken – jedes Schreiben auf einer eigenen Seite. */
export default async function MahnungenDruck({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = "" } = await searchParams;
  const liste = await api<MahnungDruck[]>(`/mahnungen?ids=${encodeURIComponent(ids)}`);
  // Briefbogen, wenn alle Schreiben von derselben Gesellschaft stammen
  const gesellschaften = [...new Set(liste.map((m) => m.gesellschaft.id))];
  const bb = await briefbogenFuer(gesellschaften.length === 1 ? gesellschaften[0] : null);
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href="/verkauf?reiter=mahnwesen">Verkauf › Mahnwesen</a> ›
          </p>
          <h1>{liste.length === 1 ? liste[0]!.titel : `${liste.length} Mahnschreiben`}</h1>
        </div>
        <div className="knopfleiste">
          {liste.length > 1 ? (
            <a className="knopf zweitrangig" href={`/schreiben/sammelversand?art=mahnung&ids=${liste.map((m) => m.id).join(",")}`}>
              <Mail size={16} /> Per E-Mail senden
            </a>
          ) : null}
          <PdfKnopf pfad={`/mahnungen/druck?ids=${liste.map((m) => m.id).join(",")}`} briefbogen={bb.aktiv} />
          <DruckKnopf>
            <Printer size={16} /> Drucken
          </DruckKnopf>
        </div>
      </div>
      {liste.map((m, i) => (
        <Schreiben key={m.id} m={m} bb={bb} erstes={i === 0} />
      ))}
      {liste.length === 1 ? <PerMailSenden art="mahnung" id={liste[0]!.id} pfad={`/mahnungen/druck?ids=${liste[0]!.id}`} /> : null}
    </>
  );
}

function Schreiben({ m, bb, erstes }: { m: MahnungDruck; bb: Briefbogen; erstes: boolean }) {
  const e = m.empfaenger;
  const anrede = e.anrede === "Frau" ? `Sehr geehrte Frau ${e.nachname}` : e.anrede === "Herr" ? `Sehr geehrter Herr ${e.nachname}` : "Sehr geehrte Damen und Herren";
  const gesamt = Number(m.offenerBetrag) + Number(m.verzugszinsen) + Number(m.mahngebuehr);
  const zinsText = m.vertrag.verzugszinsProzent
    ? `${deZahl(m.vertrag.verzugszinsProzent)} % p. a. (vertraglich vereinbart)`
    : `${m.vertrag.verbraucher ? "5" : "9"} Prozentpunkte über dem jeweiligen Basiszinssatz (§ 288 BGB)`;
  return (
    <article className={`schreiben seitenumbruch ${bb.klasse}`}>
      {erstes ? bb.kopf : null}
      {bb.felder(m.datum)}
      <header>
        <div className="absender">
          {m.gesellschaft.name}
          {m.gesellschaft.anschrift ? ` · ${m.gesellschaft.anschrift}` : ""}
        </div>
        <div className="empfaenger">
          {m.kaeufer.map((k) => (
            <div key={k.id}>{[k.anrede, partnerName(k)].filter(Boolean).join(" ")}</div>
          ))}
          {e.strasse ? <div>{e.strasse}</div> : null}
          {e.plz || e.ort ? <div>{[e.plz, e.ort].filter(Boolean).join(" ")}</div> : null}
        </div>
        <dl className="infoblock">
          <dt className="info-datum">Datum</dt>
          <dd className="info-datum">{deDatum(m.datum)}</dd>
          <dt>Rechnungs-Nr.</dt>
          <dd>{m.anforderung.rechnungsnr}</dd>
          <dt>Kaufvertrag</dt>
          <dd>{m.vertrag.nr}</dd>
          {m.vertrag.urkundennr ? (
            <>
              <dt>UR-Nr.</dt>
              <dd>{m.vertrag.urkundennr}</dd>
            </>
          ) : null}
        </dl>
      </header>
      <h2>{m.titel}</h2>
      <p className="betreff">
        Bauvorhaben {m.projekt.suchcode}
        {m.projekt.ort ? `, ${[m.projekt.plz, m.projekt.ort].filter(Boolean).join(" ")}` : ""} –{" "}
        {m.vertrag.einheiten.map((x) => `${EINHEIT_TYP_TEXT[x.typ as keyof typeof EINHEIT_TYP_TEXT] ?? x.typ} ${x.nr}`).join(", ")}
      </p>
      <p>{anrede},</p>
      {m.stufe === 1 ? (
        <p>
          sicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Zahlungsanforderung {m.anforderung.rechnungsnr} vom {deDatum(m.anforderung.angefordertAm)} (Rate{" "}
          {m.anforderung.raten.join(", ")}) war am {deDatum(m.anforderung.faelligAm)} fällig und ist bisher nicht vollständig beglichen.
        </p>
      ) : (
        <p>
          trotz unserer {m.vorherige.map((v) => `${v.stufe === 1 ? "Zahlungserinnerung" : "Mahnung"} vom ${deDatum(v.datum)}`).join(" und ")} ist unsere Zahlungsanforderung{" "}
          {m.anforderung.rechnungsnr} vom {deDatum(m.anforderung.angefordertAm)}, fällig am {deDatum(m.anforderung.faelligAm)}, nicht vollständig beglichen.
        </p>
      )}
      <table className="druckliste">
        <tbody>
          <tr>
            <td>Zahlungsanforderung {m.anforderung.rechnungsnr}</td>
            <td className="num">{deZahl(m.anforderung.betrag)} €</td>
          </tr>
          {m.zahlungen.map((z) => (
            <tr key={z.datum + z.betrag}>
              <td>abzüglich Zahlung vom {deDatum(z.datum)}</td>
              <td className="num">−{deZahl(z.betrag)} €</td>
            </tr>
          ))}
          <tr>
            <td>
              <b>offener Betrag</b>
            </td>
            <td className="num">
              <b>{deZahl(m.offenerBetrag)} €</b>
            </td>
          </tr>
          {Number(m.verzugszinsen) ? (
            <tr>
              <td>Verzugszinsen bis {deDatum(m.datum)} (siehe Aufstellung)</td>
              <td className="num">{deZahl(m.verzugszinsen)} €</td>
            </tr>
          ) : null}
          {Number(m.mahngebuehr) ? (
            <tr>
              <td>Mahnkosten</td>
              <td className="num">{deZahl(m.mahngebuehr)} €</td>
            </tr>
          ) : null}
        </tbody>
        {m.stufe >= 2 ? (
          <tfoot>
            <tr>
              <td>
                <b>Gesamtbetrag</b>
              </td>
              <td className="num">
                <b>{deZahl(gesamt)} €</b>
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      {m.stufe === 1 ? (
        <p>
          Wir bitten Sie, den offenen Betrag bis zum <b>{deDatum(m.fristBis)}</b> unter Angabe der Rechnungsnummer zu überweisen. Sollten Sie die Zahlung inzwischen
          veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.
        </p>
      ) : (
        <p>
          Bitte überweisen Sie den Gesamtbetrag {m.stufe === 3 ? "letztmalig " : ""}bis zum <b>{deDatum(m.fristBis)}</b>. Für die Dauer des Verzugs berechnen wir
          Verzugszinsen in Höhe von {zinsText}.
        </p>
      )}
      {m.stufe === 3 ? (
        <p>
          Sollte der Betrag bis zu diesem Datum nicht bei uns eingegangen sein, werden wir ohne weitere Ankündigung gerichtliche Schritte einleiten. Die dadurch
          entstehenden Kosten gehen zu Ihren Lasten.
        </p>
      ) : null}
      {m.stufe >= 2 && m.zinsperioden.length ? (
        <table className="druckliste klein">
          <thead>
            <tr>
              <th>Zeitraum</th>
              <th className="num">Tage</th>
              <th className="num">Kapital €</th>
              <th className="num">Zinssatz</th>
              <th className="num">Zinsen €</th>
            </tr>
          </thead>
          <tbody>
            {m.zinsperioden.map((p) => (
              <tr key={p.von}>
                <td>
                  {deDatum(p.von)} – {deDatum(p.bis)}
                </td>
                <td className="num">{p.tage}</td>
                <td className="num">{deZahl(p.kapital)}</td>
                <td className="num">{deZahl(p.zinssatz)} %</td>
                <td className="num">{deZahl(p.zinsen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p>Mit freundlichen Grüßen</p>
      <p>{m.gesellschaft.name}</p>
    </article>
  );
}
