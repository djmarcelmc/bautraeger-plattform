import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { PdfKnopf } from "@/components/PdfKnopf";
import { api } from "@/lib/api";
import { briefbogenFuer } from "@/lib/briefbogen";
import { deDatum } from "@/lib/format";
import type { Gesellschaft } from "@/lib/typen";

export const dynamic = "force-dynamic";

/** Musterbrief zum Einrichten des Briefbogens: Anschrift, Infoblock, Betreff und Fließtext über mehr als eine Seite. */
export default async function Musterbrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await api<Gesellschaft>(`/gesellschaften/${id}`);
  const bb = await briefbogenFuer(id);
  const heute = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href={`/gesellschaften/${id}`}>{g.name}</a> ›
          </p>
          <h1>Musterbrief</h1>
          <p className="untertitel">Zum Prüfen von Anschriftfeld, Rändern und Feldern – das PDF zeigt das Schreiben auf dem Briefbogen.</p>
        </div>
        <div className="knopfleiste">
          <PdfKnopf pfad={`/gesellschaften/${id}/musterbrief`} briefbogen={bb.aktiv} />
          <DruckKnopf>
            <Printer size={16} /> Drucken
          </DruckKnopf>
        </div>
      </div>
      <article className={`schreiben ${bb.klasse}`}>
        {bb.kopf}
        {bb.felder(heute)}
        <header>
          <div className="absender">
            {g.name}
            {g.anschrift ? ` · ${g.anschrift}` : ""}
          </div>
          <div className="empfaenger">
            <div>Frau Erika Mustermann</div>
            <div>Herr Max Beispiel</div>
            <div>Musterstraße 12</div>
            <div>70173 Stuttgart</div>
          </div>
          <dl className="infoblock">
            <dt className="info-datum">Datum</dt>
            <dd className="info-datum">{deDatum(heute)}</dd>
            <dt>Rechnungs-Nr.</dt>
            <dd>ZA-2026-00001</dd>
            <dt>Kaufvertrag</dt>
            <dd>KV-101-001</dd>
          </dl>
        </header>
        <h2>Zahlungsanforderung nach § 3 Abs. 2 MaBV</h2>
        <p className="betreff">Bauvorhaben Musterstraße, 70173 Stuttgart – Wohneinheit 01</p>
        <p>Sehr geehrte Frau Mustermann, sehr geehrter Herr Beispiel,</p>
        {Array.from({ length: 9 }, (_, i) => (
          <p key={i}>
            Dies ist ein Mustertext ({i + 1}/9), damit Sie Ränder, Zeilenlänge und den Seitenumbruch auf dem Briefbogen prüfen können. Der Text läuft bewusst über mehr als
            eine Seite, damit auch der obere Rand der Folgeseiten und der Abstand zur Fußzeile sichtbar werden. Passen Sie die Werte in den Einstellungen der Gesellschaft an, bis
            Anschrift und Text sauber im freien Bereich des Briefbogens stehen.
          </p>
        ))}
        <p>Mit freundlichen Grüßen</p>
        <p>{g.name}</p>
      </article>
    </>
  );
}
