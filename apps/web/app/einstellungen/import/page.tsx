import { IMPORT_SPALTEN } from "@bt/domain";
import { api } from "@/lib/api";
import type { Projekt } from "@/lib/typen";
import { EinstellungenReiter } from "../Reiter";
import { ImportAssistent } from "./ImportAssistent";

export const dynamic = "force-dynamic";

export default async function Datenimport({ searchParams }: { searchParams: Promise<{ art?: string; projekt?: string }> }) {
  const q = await searchParams;
  const projekte = await api<Projekt[]>("/projekte");
  const spalten = {
    partner: IMPORT_SPALTEN.partner.map(({ titel, pflicht, hinweis }) => ({ titel, pflicht: !!pflicht, hinweis })),
    einheiten: IMPORT_SPALTEN.einheiten.map(({ titel, pflicht, hinweis }) => ({ titel, pflicht: !!pflicht, hinweis })),
  };
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Einstellungen</h1>
          <p className="untertitel">Werte, die für alle Gesellschaften gelten</p>
        </div>
      </div>
      <EinstellungenReiter aktiv="import" />
      <ImportAssistent
        projekte={projekte.map((p) => ({ id: p.id, text: `${p.nr} ${p.suchcode}` }))}
        spalten={spalten}
        startArt={q.art === "einheiten" ? "einheiten" : "partner"}
        startProjekt={q.projekt}
      />
    </>
  );
}
