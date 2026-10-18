import { Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import type { Gesellschaft, ProtokollEintrag } from "@/lib/typen";
import { gesellschaftAendern } from "../aktionen";
import { GesellschaftFelder } from "../GesellschaftFelder";

export const dynamic = "force-dynamic";

export default async function GesellschaftBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [g, protokoll] = await Promise.all([api<Gesellschaft>(`/gesellschaften/${id}`), api<ProtokollEintrag[]>(`/protokoll/${id}`)]);
  return (
    <>
      <p className="brotkrumen">
        <a href="/gesellschaften">Gesellschaften</a> ›
      </p>
      <h1>
        {g.nr} · {g.name}
      </h1>
      <Formular aktion={gesellschaftAendern.bind(null, id)}>
        <GesellschaftFelder g={g} />
      </Formular>
      <details className="karte">
        <summary>Änderungsprotokoll ({protokoll.length})</summary>
        <Protokoll eintraege={protokoll} />
      </details>
    </>
  );
}
