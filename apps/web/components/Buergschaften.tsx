import { BUERGSCHAFT_ARTEN, BUERGSCHAFT_ART_TEXT, BUERGSCHAFT_STATUS_TEXT } from "@bt/domain";
import { Auswahl, Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type Buergschaft, type BuergschaftListe, type Partner } from "@/lib/typen";
import { buergschaftAnlegen } from "../app/buergschaften/aktionen";

const STATUS_KLASSE: Record<string, string> = { aktiv: "gut", laeuft_ab: "warnung", rueckgabe_faellig: "info", abgelaufen: "gefahr", zurueckgegeben: "" };

export function BuergschaftStatus({ status }: { status: Buergschaft["status"] }) {
  return <span className={`badge ${STATUS_KLASSE[status]}`}>{BUERGSCHAFT_STATUS_TEXT[status]}</span>;
}

/** Felder einer Bürgschaft; Richtung und Vertrag werden vom Aufrufer gesetzt. */
export function BuergschaftFelder({ b, richtung, banken }: { b?: Buergschaft; richtung: "erhalten" | "ausgegeben"; banken: Partner[] }) {
  const arten = BUERGSCHAFT_ARTEN.filter((a) => (richtung === "erhalten" ? a !== "mabv7" : a === "mabv7" || a === "sonstige"));
  return (
    <div className="raster">
      <Auswahl label="Art" name="art" wert={b?.art ?? arten[0]} optionen={arten.map((a) => ({ wert: a, text: BUERGSCHAFT_ART_TEXT[a] }))} pflicht />
      <Feld label="Betrag €" name="betrag" wert={b ? deZahl(b.betrag) : undefined} zahl pflicht />
      <Auswahl label="Bürge (Bank/Versicherer)" name="buergeId" wert={b?.buergeId} leer="– nicht erfasst –" optionen={banken.map((p) => ({ wert: p.id, text: partnerName(p) }))} />
      <Feld label="Bürgschaftsnummer" name="nr" wert={b?.nr} />
      <Feld label="ausgestellt am" name="ausgestelltAm" typ="date" wert={b?.ausgestelltAm} />
      <Feld label="gültig bis" name="gueltigBis" typ="date" wert={b?.gueltigBis} hinweis="leer = unbefristet" />
      <Feld label="zurückgegeben am" name="rueckgabeAm" typ="date" wert={b?.rueckgabeAm} />
      <Feld label="Bemerkung" name="bemerkung" wert={b?.bemerkung} breit />
    </div>
  );
}

export function BuergschaftTabelle({ liste, mitBezug = true }: { liste: Buergschaft[]; mitBezug?: boolean }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Art</th>
          {mitBezug && <th>Projekt / Bezug</th>}
          <th>Bürge / Nr.</th>
          <th className="num">Betrag €</th>
          <th>gültig bis</th>
          <th>Rückgabe fällig ab</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {liste.map((b) => (
          <tr key={b.id} className={`klickbar${b.status === "zurueckgegeben" ? " erledigt" : ""}`}>
            <td>
              <a href={`/buergschaften/${b.id}`} className="zeilenlink">
                {b.artText}
              </a>
              <div className="hint">{b.richtung === "erhalten" ? "erhalten" : "ausgegeben"}</div>
            </td>
            {mitBezug && (
              <td>
                {b.projekt ? `${b.projekt.nr} ${b.projekt.suchcode}` : ""}
                <div className="hint">{b.bezug}</div>
              </td>
            )}
            <td>
              {b.buerge ?? "–"}
              {b.nr ? <div className="hint">{b.nr}</div> : null}
            </td>
            <td className="num">{deZahl(b.betrag)}</td>
            <td>{b.gueltigBis ? deDatum(b.gueltigBis) : "unbefristet"}</td>
            <td>{deDatum(b.rueckgabeFaelligAb) || <span className="hint">–</span>}</td>
            <td>
              <BuergschaftStatus status={b.status} />
              {b.rueckgabeAm ? <div className="hint">am {deDatum(b.rueckgabeAm)}</div> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Bürgschaften eines Handwerker- oder Kaufvertrags mit Erfassungsformular. */
export async function BuergschaftenAbschnitt({ richtung, vertragId, pfad, hinweis }: { richtung: "erhalten" | "ausgegeben"; vertragId: string; pfad: string; hinweis?: string }) {
  const feld = richtung === "erhalten" ? "handwerkervertragId" : "kaufvertragId";
  const [d, banken] = await Promise.all([api<BuergschaftListe>(`/buergschaften?${feld}=${vertragId}`), api<Partner[]>("/partner?rolle=bank")]);
  return (
    <div className="zweispaltig">
      <section className="karte ohne-innenabstand">
        <h2 className="kartentitel">Bürgschaften</h2>
        {d.buergschaften.length ? <BuergschaftTabelle liste={d.buergschaften} mitBezug={false} /> : <p className="leer">Noch keine Bürgschaft erfasst.</p>}
      </section>
      <section className="karte">
        <h2>Bürgschaft erfassen</h2>
        {hinweis ? <p className="hint">{hinweis}</p> : null}
        <Formular aktion={buergschaftAnlegen.bind(null, pfad)} knopf="Bürgschaft erfassen" zuruecksetzen>
          <input type="hidden" name="richtung" value={richtung} />
          <input type="hidden" name={feld} value={vertragId} />
          <BuergschaftFelder richtung={richtung} banken={banken} />
        </Formular>
        {!banken.length && (
          <p className="hint">
            Tipp: Banken und Versicherer als Geschäftspartner mit der Rolle „Bank“ anlegen, dann sind sie hier als Bürge wählbar.
          </p>
        )}
      </section>
    </div>
  );
}
