import { Camera } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import type { Kostenkontrolle, ProjektDetail, ProjektListe } from "@/lib/typen";
import { mangelAnlegen } from "../aktionen";
import { MangelFelder } from "../MangelFelder";

export const dynamic = "force-dynamic";

export default async function MangelNeu({ searchParams }: { searchParams: Promise<{ projekt?: string; einheit?: string }> }) {
  const { projekt: projektId } = await searchParams;
  if (!projektId) {
    const projekte = await api<ProjektListe[]>("/projekte?abgeschlossen=alle");
    return (
      <>
        <p className="brotkrumen">
          <a href="/maengel">Mängel</a> ›
        </p>
        <h1>Mangel erfassen</h1>
        <p className="untertitel">In welchem Projekt?</p>
        <div className="kachelraster" style={{ marginTop: 16 }}>
          {projekte.map((p) => (
            <a key={p.id} href={`?projekt=${p.id}`} className="projektkachel">
              <span className="projektnr">{p.nr}</span>
              <div className="kacheltitel">{p.suchcode}</div>
              <div className="kachelzeile">{p.ort}</div>
            </a>
          ))}
        </div>
      </>
    );
  }
  const [projekt, kosten] = await Promise.all([api<ProjektDetail>(`/projekte/${projektId}`), api<Kostenkontrolle>(`/projekte/${projektId}/kosten`)]);
  return (
    <>
      <p className="brotkrumen">
        <a href="/maengel">Mängel</a> › <a href={`/projekte/${projekt.id}?reiter=maengel`}>{projekt.nr} {projekt.suchcode}</a> ›
      </p>
      <h1>Mangel erfassen</h1>
      <Formular aktion={mangelAnlegen} knopf="Mangel speichern">
        <label className="fotoaufnahme">
          <Camera size={28} />
          <span>
            <b>Fotos aufnehmen oder auswählen</b>
            <small>Auf dem Handy öffnet sich die Kamera. Mehrere Fotos möglich.</small>
          </span>
          <input type="file" name="fotos" accept="image/*" capture="environment" multiple />
        </label>
        <MangelFelder projektId={projekt.id} einheiten={projekt.einheiten} kosten={kosten} />
      </Formular>
    </>
  );
}
