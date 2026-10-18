import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { partnerAnlegen } from "../aktionen";
import { PartnerFelder } from "../PartnerFelder";

export const dynamic = "force-dynamic";

export default async function PartnerNeu() {
  const { nr } = await api<{ nr: number }>("/partner/naechste-nr");
  return (
    <>
      <p className="brotkrumen">
        <a href="/partner">Geschäftspartner</a> ›
      </p>
      <h1>Neuer Geschäftspartner</h1>
      <Formular aktion={partnerAnlegen} knopf="Anlegen">
        <PartnerFelder vorschlagNr={nr} />
      </Formular>
    </>
  );
}
