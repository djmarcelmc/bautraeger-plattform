import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Dokumente } from "@/components/Dokumente";
import { Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import type { Einheit, ProjektDetail, ProtokollEintrag } from "@/lib/typen";
import { einheitAendern, einheitLoeschen } from "../aktionen";
import { EinheitFelder } from "../EinheitFelder";

export const dynamic = "force-dynamic";

export default async function EinheitSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await api<Einheit>(`/einheiten/${id}`);
  const [projekt, protokoll] = await Promise.all([
    api<ProjektDetail>(`/projekte/${e.projekt.id}`),
    api<ProtokollEintrag[]>(`/protokoll/${id}`),
  ]);
  const verkauft = projekt.einheiten.find((x) => x.id === id)?.verkauft;
  return (
    <>
      <p className="brotkrumen">
        <a href="/projekte">Projekte</a> › <a href={`/projekte/${e.projekt.id}`}>{e.projekt.nr} {e.projekt.suchcode}</a> ›
      </p>
      <div className="seitenkopf">
        <h1>
          {EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ} {e.nr}
        </h1>
        {verkauft ? <span className="badge info">verkauft</span> : <span className="badge gut">frei</span>}
      </div>
      <Formular aktion={einheitAendern.bind(null, id)}>
        <EinheitFelder e={e} andere={projekt.einheiten} />
      </Formular>
      <h2>Dokumente</h2>
      <Dokumente objektTyp="einheit" objektId={id} pfad={`/einheiten/${id}`} />
      <details className="karte">
        <summary>Änderungsprotokoll ({protokoll.length})</summary>
        <Protokoll eintraege={protokoll} />
      </details>
      {!verkauft && (
        <div className="karte gefahrenzone">
          <div>
            <b>Einheit löschen</b>
            <p className="hint">Nur möglich, solange die Einheit in keinem Kaufvertrag steht. Die Löschung wird protokolliert.</p>
          </div>
          <Formular
            aktion={einheitLoeschen.bind(null, id, e.projekt.id)}
            knopf="Löschen"
            knopfArt="gefahr"
            bestaetigen={`Einheit ${e.nr} wirklich löschen?`}
            className="inline"
          />
        </div>
      )}
    </>
  );
}
