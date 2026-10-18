import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { PdfKnopf } from "@/components/PdfKnopf";
import { briefbogenFuer } from "@/lib/briefbogen";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import { partnerName, type MangelDetail } from "@/lib/typen";

export const dynamic = "force-dynamic";

const BETREFF = ["Mängelrüge", "Mängelrüge – Nachfristsetzung", "Mängelrüge – letzte Fristsetzung"];

/** Rügeschreiben an den Handwerker als druckfertiges Dokument. */
export default async function Ruegeschreiben({ params }: { params: Promise<{ id: string; stufe: string }> }) {
  const { id, stufe } = await params;
  const m = await api<MangelDetail>(`/maengel/${id}`);
  const r = m.ruegen.find((x) => x.stufe === Number(stufe));
  if (!r) return <p className="fehler">Diese Rüge gibt es nicht.</p>;
  const h = m.handwerker;
  const frueher = m.ruegen.filter((x) => x.stufe < r.stufe);
  const bb = await briefbogenFuer(m.gesellschaft.id);
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href="/maengel">Mängel</a> › <a href={`/maengel/${id}`}>{m.nr} {m.titel}</a> ›
          </p>
          <h1>{r.stufe}. Rüge</h1>
        </div>
        <div className="knopfleiste">
          <PdfKnopf pfad={`/maengel/${id}/ruege/${r.stufe}`} briefbogen={bb.aktiv} />
          <DruckKnopf>
            <Printer size={16} /> Drucken
          </DruckKnopf>
        </div>
      </div>
      <article className={`schreiben ${bb.klasse}`}>
        {bb.kopf}
        {bb.felder(r.geruegtAm)}
        <header>
          <div className="absender">
            {m.gesellschaft.name}
            {m.gesellschaft.anschrift ? ` · ${m.gesellschaft.anschrift}` : ""}
          </div>
          <div className="empfaenger">
            {h ? (
              <>
                <div>{partnerName(h) || h.suchcode}</div>
                {h.strasse ? <div>{h.strasse}</div> : null}
                {h.plz || h.ort ? <div>{[h.plz, h.ort].filter(Boolean).join(" ")}</div> : null}
              </>
            ) : (
              <div>–</div>
            )}
          </div>
          <dl className="infoblock">
            <dt className="info-datum">Datum</dt>
            <dd className="info-datum">{deDatum(r.geruegtAm)}</dd>
            <dt>Mangel-Nr.</dt>
            <dd>
              {m.projekt.nr}-{m.nr}
            </dd>
            {m.vertrag?.nrIntern ? (
              <>
                <dt>Ihr Auftrag</dt>
                <dd>{m.vertrag.nrIntern}</dd>
              </>
            ) : null}
          </dl>
        </header>
        <h2>
          {BETREFF[r.stufe - 1]} ({r.stufe}. Rüge)
        </h2>
        <p className="betreff">
          Bauvorhaben {m.projekt.suchcode}
          {m.projekt.strasse ? `, ${m.projekt.strasse}` : ""}
          {m.projekt.ort ? `, ${[m.projekt.plz, m.projekt.ort].filter(Boolean).join(" ")}` : ""}
          {m.gewerk ? ` – Gewerk ${m.gewerk.bezeichnung}` : ""}
        </p>
        <p>Sehr geehrte Damen und Herren,</p>
        {r.stufe === 1 ? (
          <p>bei dem oben genannten Bauvorhaben wurde folgender Mangel an Ihrer Leistung festgestellt:</p>
        ) : (
          <p>
            mit Schreiben vom {frueher.map((x) => deDatum(x.geruegtAm)).join(" und ")} haben wir Sie aufgefordert, den folgenden Mangel zu beseitigen. Die
            gesetzte Frist ist ohne Mangelbeseitigung abgelaufen.
          </p>
        )}
        <div className="mangelkasten">
          <b>{m.titel}</b>
          {m.ort ? <div>Lage: {m.ort}</div> : null}
          {m.einheit ? <div>Einheit: {m.einheit.nr}</div> : <div>Gemeinschaftseigentum</div>}
          <div>
            Festgestellt am {deDatum(m.festgestelltAm)}
            {m.festgestelltDurch ? ` durch ${m.festgestelltDurch}` : ""}
          </div>
          {m.beschreibung ? <p>{m.beschreibung}</p> : null}
        </div>
        <p>
          Wir fordern Sie {r.stufe > 1 ? "hiermit letztmalig " : ""}auf, den Mangel bis spätestens <b>{deDatum(r.nachfristBis ?? r.fristBis)}</b> fachgerecht zu
          beseitigen und uns die Fertigstellung schriftlich anzuzeigen. Bitte stimmen Sie den Termin vorab mit unserer Bauleitung ab.
        </p>
        {r.stufe === 3 ? (
          <p>
            Nach fruchtlosem Ablauf dieser Frist behalten wir uns vor, den Mangel auf Ihre Kosten durch ein anderes Unternehmen beseitigen zu lassen
            (Ersatzvornahme) und die Kosten mit Ihren Forderungen zu verrechnen.
          </p>
        ) : null}
        {m.einbehalt ? <p>Bis zur Beseitigung des Mangels behalten wir einen angemessenen Betrag Ihrer Vergütung ein.</p> : null}
        <p>Mit freundlichen Grüßen</p>
        <p>{m.gesellschaft.name}</p>
      </article>
    </>
  );
}
