import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import type { Gesellschaft } from "@/lib/typen";
import { projektAnlegen } from "../aktionen";
import { ProjektFelder } from "../ProjektFelder";

export const dynamic = "force-dynamic";

export default async function ProjektNeu() {
  const gesellschaften = await api<Gesellschaft[]>("/gesellschaften");
  if (!gesellschaften.length)
    return (
      <>
        <h1>Neues Projekt</h1>
        <div className="karte">
          Bitte zuerst eine <a href="/gesellschaften">Gesellschaft anlegen</a>.
        </div>
      </>
    );
  const { nr } = await api<{ nr: number }>(`/projekte/naechste-nr?gesellschaftId=${gesellschaften[0]!.id}`);
  return (
    <>
      <p className="brotkrumen">
        <a href="/projekte">Projekte</a> ›
      </p>
      <h1>Neues Projekt</h1>
      <Formular aktion={projektAnlegen} knopf="Projekt anlegen">
        <ProjektFelder gesellschaften={gesellschaften} vorschlagNr={nr} />
      </Formular>
    </>
  );
}
