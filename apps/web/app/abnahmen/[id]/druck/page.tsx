import { ABNAHME_ERGEBNIS_TEXT, ABNAHME_ERGEBNISSE, EINHEIT_TYP_TEXT, ZAEHLER, ZAEHLER_TEXT } from "@bt/domain";
import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { api } from "@/lib/api";
import { deDatum } from "@/lib/format";
import { partnerName, type AbnahmeDetail } from "@/lib/typen";

export const dynamic = "force-dynamic";

/** Abnahmeprotokoll zum Ausdrucken und Unterschreiben (Browser-Druck → PDF). */
export default async function AbnahmeDruck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api<AbnahmeDetail>(`/abnahmen/${id}`);
  const objekt = [a.projekt.strasse, [a.projekt.plz, a.projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const gegenpartei = a.kaufvertrag
    ? { rolle: a.kaufvertrag.kaeufer.length > 1 ? "Erwerber" : "Erwerber/in", namen: a.kaufvertrag.kaeufer.map(partnerName) }
    : a.handwerkervertrag
      ? { rolle: "Auftragnehmer", namen: [a.handwerkervertrag.handwerker ? partnerName(a.handwerkervertrag.handwerker) : "–"] }
      : { rolle: "Verwalter / Beirat / Erwerber", namen: [] as string[] };
  const zaehler = ZAEHLER.filter((z) => a.zaehler[z]);
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href={`/abnahmen/${id}`}>Abnahme Nr. {a.nr}</a> ›
          </p>
          <h1>Abnahmeprotokoll</h1>
          {!a.abgeschlossenAm && <p className="untertitel">Entwurf – das Ergebnis wird beim Termin angekreuzt oder nach dem Abschluss gedruckt.</p>}
        </div>
        <DruckKnopf>
          <Printer size={16} /> Drucken / PDF
        </DruckKnopf>
      </div>
      <article className="schreiben protokoll">
        <div className="absender">
          {a.gesellschaft.name}
          {a.gesellschaft.anschrift ? ` · ${a.gesellschaft.anschrift}` : ""}
        </div>
        <h2>Abnahmeprotokoll Nr. {a.nr}</h2>
        <p className="betreff">{a.artText}</p>
        <table className="druckliste kopf">
          <tbody>
            <tr>
              <th>Bauvorhaben</th>
              <td>
                {a.projekt.nr} {a.projekt.suchcode}
                {objekt ? `, ${objekt}` : ""}
              </td>
            </tr>
            {a.einheit && (
              <tr>
                <th>Einheit</th>
                <td>
                  {a.einheit.nr} – {EINHEIT_TYP_TEXT[a.einheit.typ as keyof typeof EINHEIT_TYP_TEXT] ?? a.einheit.typ}
                  {a.einheit.art ? ` ${a.einheit.art}` : ""}
                  {a.einheit.etage ? `, ${a.einheit.etage}` : ""}
                </td>
              </tr>
            )}
            {a.kaufvertrag && (
              <tr>
                <th>Kaufvertrag</th>
                <td>
                  {a.kaufvertrag.nr}
                  {a.kaufvertrag.urkundennr ? `, ${/^UR/i.test(a.kaufvertrag.urkundennr) ? "" : "UR-Nr. "}${a.kaufvertrag.urkundennr}` : ""}
                </td>
              </tr>
            )}
            {a.handwerkervertrag && (
              <tr>
                <th>Leistung</th>
                <td>
                  {a.handwerkervertrag.gewerk}
                  {a.handwerkervertrag.nrIntern ? `, Vertrag ${a.handwerkervertrag.nrIntern}` : ""}
                </td>
              </tr>
            )}
            <tr>
              <th>Auftraggeber/Bauträger</th>
              <td>{a.gesellschaft.name}</td>
            </tr>
            <tr>
              <th>{gegenpartei.rolle}</th>
              <td>{gegenpartei.namen.join(", ") || "____________________________"}</td>
            </tr>
            <tr>
              <th>Termin</th>
              <td>
                {deDatum(a.datum)}
                {a.ort ? `, ${a.ort}` : ""}
              </td>
            </tr>
            <tr>
              <th>Teilnehmer</th>
              <td className="umbruch">{a.teilnehmer || "\n\n"}</td>
            </tr>
          </tbody>
        </table>

        <h3>Ergebnis der Begehung</h3>
        <ul className="ankreuzliste">
          {ABNAHME_ERGEBNISSE.map((e) => (
            <li key={e}>
              <span className="kaestchen">{a.ergebnis === e ? "✕" : ""}</span> Die Leistung wird {ABNAHME_ERGEBNIS_TEXT[e].replace("Abnahme verweigert", "nicht abgenommen – Abnahme verweigert")}.
            </li>
          ))}
          <li>
            <span className="kaestchen">{a.vorbehaltVertragsstrafe ? "✕" : ""}</span> Die Vertragsstrafe wird vorbehalten (§ 341 Abs. 3 BGB).
          </li>
        </ul>

        <h3>Festgestellte Mängel</h3>
        {a.maengel.length ? (
          <table className="druckliste">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Mangel</th>
                <th>Ort</th>
                <th>Gewerk</th>
              </tr>
            </thead>
            <tbody>
              {a.maengel.map((m, i) => (
                <tr key={m.id}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{m.titel}</b>
                    {m.beschreibung ? <div>{m.beschreibung}</div> : null}
                  </td>
                  <td>{m.ort}</td>
                  <td>{m.gewerk}</td>
                </tr>
              ))}
              {!a.abgeschlossenAm &&
                [1, 2, 3].map((n) => (
                  <tr key={`leer-${n}`} className="leerzeile">
                    <td>{a.maengel.length + n}</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p>{a.abgeschlossenAm ? "Es wurden keine Mängel festgestellt." : "Keine Mängel erfasst. Ergänzungen: ________________________________________"}</p>
        )}
        {a.maengel.length > 0 && (
          <p className="klein">Die aufgeführten Mängel werden vom Bauträger bzw. Auftragnehmer innerhalb angemessener Frist beseitigt. Die Rechte wegen dieser Mängel bleiben vorbehalten.</p>
        )}

        {a.art !== "handwerker" && (
          <>
            <h3>Zählerstände und Schlüssel</h3>
            <table className="druckliste klein">
              <tbody>
                {(zaehler.length ? zaehler : ZAEHLER).map((z) => (
                  <tr key={z}>
                    <th>{ZAEHLER_TEXT[z]}</th>
                    <td>{a.zaehler[z] ?? ""}</td>
                  </tr>
                ))}
                <tr>
                  <th>Übergebene Schlüssel</th>
                  <td>{a.schluessel ?? ""}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
        {a.bemerkung && (
          <>
            <h3>Bemerkungen</h3>
            <p className="umbruch">{a.bemerkung}</p>
          </>
        )}
        <p className="klein">
          {a.art === "sondereigentum"
            ? "Mit der Abnahme gehen Besitz, Nutzen und Lasten auf den Erwerber über; die Verjährungsfrist für Mängelansprüche beginnt (§ 634a BGB)."
            : "Mit der Abnahme beginnt die Verjährungsfrist für Mängelansprüche (§ 634a BGB)."}
        </p>

        <div className="unterschriften">
          <div>
            <span />
            Ort, Datum, Unterschrift {a.gesellschaft.name}
          </div>
          <div>
            <span />
            Ort, Datum, Unterschrift {gegenpartei.rolle}
          </div>
        </div>
      </article>
    </>
  );
}
