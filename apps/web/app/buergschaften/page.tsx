import { ShieldCheck } from "lucide-react";
import { BuergschaftTabelle } from "@/components/Buergschaften";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import type { BuergschaftListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

const FILTER = [
  ["offen", "Laufend"],
  ["handlung", "Handlungsbedarf"],
  ["alle", "Alle"],
] as const;

export default async function Buergschaften({ searchParams }: { searchParams: Promise<{ status?: string; richtung?: string }> }) {
  const { status = "offen", richtung } = await searchParams;
  const q = new URLSearchParams({ ...(status !== "alle" ? { status } : {}), ...(richtung ? { richtung } : {}) });
  const [d, gesamt] = await Promise.all([api<BuergschaftListe>(`/buergschaften?${q}`), api<BuergschaftListe>("/buergschaften?status=offen")]);
  const link = (s: string, r?: string) => `?${new URLSearchParams({ status: s, ...(r ? { richtung: r } : {}) })}`;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Bürgschaften</h1>
          <p className="untertitel">Erhaltene Sicherheiten der Handwerker und ausgegebene Bürgschaften nach § 7 MaBV – mit Ablauf- und Rückgabeüberwachung.</p>
        </div>
      </div>
      <div className="kpis">
        <a href={link("offen", "erhalten")} className={`kpi${richtung === "erhalten" ? " kpi-aktiv" : ""}`}>
          <span>Erhalten (laufend)</span>
          <b>{deZahl(gesamt.summen.erhalten, 0)} €</b>
          <small>Vertragserfüllung, Gewährleistung, Vorauszahlung</small>
        </a>
        <a href={link("offen", "ausgegeben")} className={`kpi${richtung === "ausgegeben" ? " kpi-aktiv" : ""}`}>
          <span>Ausgegeben (laufend)</span>
          <b>{deZahl(gesamt.summen.ausgegeben, 0)} €</b>
          <small>§ 7 MaBV an Käufer</small>
        </a>
        <a href={link("handlung")} className={`kpi${gesamt.summen.handlungsbedarf ? " kpi-warnung" : ""}${status === "handlung" ? " kpi-aktiv" : ""}`}>
          <span>Handlungsbedarf</span>
          <b>{gesamt.summen.handlungsbedarf}</b>
          <small>abgelaufen, läuft bald ab oder Rückgabe fällig</small>
        </a>
      </div>
      <nav className="segment" style={{ marginBottom: 12 }}>
        {FILTER.map(([k, t]) => (
          <a key={k} href={link(k, richtung)} className={status === k ? "aktiv" : undefined}>
            {t}
          </a>
        ))}
      </nav>
      <div className="karte ohne-innenabstand">
        {d.buergschaften.length ? (
          <BuergschaftTabelle liste={d.buergschaften} />
        ) : (
          <p className="leer">
            <ShieldCheck size={18} /> Keine Bürgschaften in dieser Ansicht. Erfasst werden sie im Handwerkervertrag bzw. im Kaufvertrag unter „Bürgschaften“.
          </p>
        )}
      </div>
      <p className="hint">
        Rückgabe fällig: Vertragserfüllungsbürgschaft ab Abnahme, Gewährleistungsbürgschaft nach Ablauf der Gewährleistungsfrist, § 7-MaBV-Bürgschaft ab Übergabe. „Läuft bald ab“: Gültigkeit endet in den nächsten 60 Tagen.
      </p>
    </>
  );
}
