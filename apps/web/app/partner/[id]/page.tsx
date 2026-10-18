import { Dokumente } from "@/components/Dokumente";
import { Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { partnerName, type Partner, type ProtokollEintrag } from "@/lib/typen";
import { partnerAendern } from "../aktionen";
import { PartnerFelder } from "../PartnerFelder";

export const dynamic = "force-dynamic";

export default async function PartnerBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, protokoll] = await Promise.all([api<Partner>(`/partner/${id}`), api<ProtokollEintrag[]>(`/protokoll/${id}`)]);
  return (
    <>
      <p className="brotkrumen">
        <a href="/partner">Geschäftspartner</a> ›
      </p>
      <h1>
        {p.nr} · {partnerName(p) || p.suchcode}
      </h1>
      <Formular aktion={partnerAendern.bind(null, id)}>
        <PartnerFelder p={p} />
      </Formular>
      <h2>Dokumente</h2>
      <Dokumente objektTyp="geschaeftspartner" objektId={id} pfad={`/partner/${id}`} />
      <details className="karte">
        <summary>Änderungsprotokoll ({protokoll.length})</summary>
        <Protokoll eintraege={protokoll} />
      </details>
    </>
  );
}
