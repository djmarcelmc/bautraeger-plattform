import { BuergschaftFelder, BuergschaftStatus } from "@/components/Buergschaften";
import { Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Buergschaft, Partner, ProtokollEintrag } from "@/lib/typen";
import { buergschaftAendern, buergschaftLoeschen } from "../aktionen";

export const dynamic = "force-dynamic";

export default async function BuergschaftSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [b, banken, protokoll] = await Promise.all([api<Buergschaft>(`/buergschaften/${id}`), api<Partner[]>("/partner?rolle=bank"), api<ProtokollEintrag[]>(`/protokoll/${id}`)]);
  const vertragLink = b.handwerkervertragId ? `/handwerkervertraege/${b.handwerkervertragId}?reiter=buergschaften` : `/kaufvertraege/${b.kaufvertragId}?reiter=buergschaften`;
  return (
    <>
      <p className="brotkrumen">
        <a href="/buergschaften">Bürgschaften</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>{b.artText}</h1>
          <p className="untertitel">
            {b.projekt ? `${b.projekt.nr} ${b.projekt.suchcode} · ` : ""}
            <a href={vertragLink}>{b.bezug}</a> · {deZahl(b.betrag)} €
          </p>
        </div>
        <div className="badges">
          <BuergschaftStatus status={b.status} />
          {b.rueckgabeFaelligAb && !b.rueckgabeAm ? <span className="badge">Rückgabe fällig ab {deDatum(b.rueckgabeFaelligAb)}</span> : null}
        </div>
      </div>
      <div className="zweispaltig">
        <section className="karte">
          <h2>Daten</h2>
          <Formular aktion={buergschaftAendern.bind(null, id)}>
            <input type="hidden" name="richtung" value={b.richtung} />
            <input type="hidden" name={b.richtung === "erhalten" ? "handwerkervertragId" : "kaufvertragId"} value={(b.handwerkervertragId ?? b.kaufvertragId)!} />
            <BuergschaftFelder b={b} richtung={b.richtung} banken={banken} />
          </Formular>
          <Formular aktion={buergschaftLoeschen.bind(null, id)} knopf="Bürgschaft löschen" knopfArt="gefahr" bestaetigen="Bürgschaft wirklich löschen? Für die Rückgabe bitte stattdessen das Rückgabedatum eintragen." className="formular rechts" />
        </section>
        <section className="karte">
          <h2>Änderungsprotokoll</h2>
          <Protokoll eintraege={protokoll} />
        </section>
      </div>
    </>
  );
}
