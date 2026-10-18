import { NACHTRAG_STATUS } from "@bt/domain";
import { BuergschaftenAbschnitt } from "@/components/Buergschaften";
import { Dokumente } from "@/components/Dokumente";
import { Feld, Gruppe, Haken } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { RechnungStatus } from "@/components/RechnungStatus";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type Handwerkervertrag, type Partner } from "@/lib/typen";
import { nachtragAendern, nachtragAnlegen, rechnungErfassen, vertragAendern } from "../../kosten/aktionen";
import { VertragFelder } from "../../kosten/VertragFelder";

export const dynamic = "force-dynamic";

const REITER = [
  ["rechnungen", "Rechnungen"],
  ["nachtraege", "Nachträge"],
  ["konditionen", "Konditionen"],
  ["buergschaften", "Bürgschaften"],
  ["dokumente", "Dokumente"],
] as const;

const NT_TEXT: Record<string, string> = { angeboten: "angeboten", beauftragt: "beauftragt", abgelehnt: "abgelehnt", abgerechnet: "abgerechnet" };

export default async function VertragSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reiter?: string }> }) {
  const { id } = await params;
  const { reiter = "rechnungen" } = await searchParams;
  const v = await api<Handwerkervertrag>(`/handwerkervertraege/${id}`);
  const heute = new Date().toISOString().slice(0, 10);
  const offen = v.rechnungen.find((r) => r.status !== "bezahlt");
  const schluss = v.rechnungen.some((r) => r.schlussrechnung);
  const freistellung = v.handwerker?.freistellungGueltigBis;
  const quote = Number(v.summen.auftrag) ? (Number(v.summen.berechnet) / Number(v.summen.auftrag)) * 100 : 0;

  return (
    <>
      <p className="brotkrumen">
        <a href={`/projekte/${v.projekt.id}?reiter=kosten`}>
          {v.projekt.nr} {v.projekt.suchcode} › Kosten
        </a>{" "}
        › <a href={`/gewerke/${v.gewerk.id}?projekt=${v.projekt.id}`}>{v.gewerk.nr} {v.gewerk.bezeichnung}</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>{v.handwerker ? partnerName(v.handwerker) || v.handwerker.suchcode : "Handwerkervertrag"}</h1>
          <div className="metazeile">
            <span>
              {v.gewerk.nr} {v.gewerk.bezeichnung}
            </span>
            {v.nrIntern ? <span>Nr. {v.nrIntern}</span> : null}
            {v.vertragVom ? <span>Vertrag vom {deDatum(v.vertragVom)}</span> : null}
          </div>
        </div>
        <div className="badges">
          {v.maengel.offen ? (
            <a href={`/maengel?handwerker=${v.handwerkerId}`} className="badge gefahr">
              {v.maengel.offen} offene Mängel{Number(v.maengel.einbehalt) ? ` · Einbehalt ${deZahl(v.maengel.einbehalt, 0)} €` : ""}
            </a>
          ) : null}
          {freistellung && freistellung >= heute ? (
            <span className="badge gut">Freistellung bis {deDatum(freistellung)}</span>
          ) : (
            <a href={v.handwerker ? `/partner/${v.handwerker.id}` : "#"} className="badge warnung">
              keine gültige Freistellung – 15 % Bauabzugsteuer
            </a>
          )}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Auftrag inkl. Nachträge</span>
          <b>{deZahl(v.summen.auftrag)} €</b>
          <small>Vertrag {deZahl(v.summen.vertrag, 0)} € · Nachträge {deZahl(v.summen.nachtraege, 0)} €</small>
        </div>
        <div className="kpi">
          <span>Berechnet (geprüft)</span>
          <b>{deZahl(v.summen.berechnet)} €</b>
          <div className="balken">
            <div style={{ width: `${Math.min(100, quote)}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span>Ausgezahlt</span>
          <b>{deZahl(v.summen.ausgezahlt)} €</b>
          <small>Skonto {deZahl(v.summen.skonto, 0)} € · Bauabzug {deZahl(v.summen.bauabzugsteuer, 0)} €</small>
        </div>
        <div className="kpi">
          <span>Einbehalte & Umlagen</span>
          <b>{deZahl(v.summen.restBerechnet)} €</b>
          <small>geprüft, aber nicht abgegolten</small>
        </div>
      </div>
      <nav className="reiter">
        {REITER.map(([k, t]) => (
          <a key={k} href={`?reiter=${k}`} className={reiter === k ? "aktiv" : undefined}>
            {t}
            {k === "nachtraege" && v.nachtraege.length ? ` (${v.nachtraege.length})` : ""}
          </a>
        ))}
      </nav>

      {reiter === "rechnungen" && (
        <>
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th>Rechnung</th>
                  <th>Eingang</th>
                  <th className="num">lt. Rechnung (kum.) €</th>
                  <th className="num">geprüft (kum.) €</th>
                  <th className="num">Auszahlung €</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {v.rechnungen.map((r) => (
                  <tr key={r.id} className="klickbar">
                    <td>
                      <a href={`/eingangsrechnungen/${r.id}`} className="zeilenlink">
                        {r.rechnungsnr}
                      </a>
                      {r.schlussrechnung ? <span className="badge klein">Schlussrechnung</span> : null}
                    </td>
                    <td>{deDatum(r.eingangAm)}</td>
                    <td className="num">{deZahl(r.betragBrutto)}</td>
                    <td className="num">{deZahl(r.geprueftKumuliert)}</td>
                    <td className="num">{deZahl(v.zahlungen.find((z) => z.eingangsrechnungId === r.id)?.betrag)}</td>
                    <td>
                      <RechnungStatus status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!v.rechnungen.length && <p className="leer">Noch keine Rechnungen.</p>}
          </div>
          {offen ? (
            <p className="hint">
              Neue Rechnungen können erfasst werden, sobald <a href={`/eingangsrechnungen/${offen.id}`}>{offen.rechnungsnr}</a> bezahlt ist (kumulierte Abrechnung).
            </p>
          ) : schluss ? (
            <p className="hint">Die Schlussrechnung ist abgerechnet.</p>
          ) : (
            <>
              <h2>Rechnung erfassen</h2>
              <Formular aktion={rechnungErfassen.bind(null, id)} knopf="Rechnung erfassen">
                <Gruppe titel="Eingangsrechnung">
                  <Feld label="Rechnungs-Nr." name="rechnungsnr" pflicht />
                  <Feld label="Rechnungsdatum" name="rechnungsdatum" typ="date" pflicht />
                  <Feld label="Eingang am" name="eingangAm" typ="date" wert={heute} pflicht />
                  <Feld label="Betrag brutto € (kumuliert)" name="betragBrutto" zahl pflicht hinweis="Gesamtleistung laut Rechnung bis heute" />
                  <Haken label="Schlussrechnung" name="schlussrechnung" />
                </Gruppe>
              </Formular>
            </>
          )}
        </>
      )}

      {reiter === "nachtraege" && (
        <>
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th className="num">Nr.</th>
                  <th>Leistung</th>
                  <th className="num">Betrag €</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {v.nachtraege.map((n) => (
                  <tr key={n.id}>
                    <td className="num">{n.nr}</td>
                    <td>{n.text}</td>
                    <td className="num">{deZahl(n.betragBrutto)}</td>
                    <td>
                      <Formular aktion={nachtragAendern.bind(null, id, n.id)} knopf="Ändern" knopfArt="zweitrangig" className="inline zeilenformular">
                        <input type="hidden" name="text" value={n.text} />
                        <input type="hidden" name="betragBrutto" value={n.betragBrutto} />
                        <select name="status" defaultValue={n.status} aria-label={`Status Nachtrag ${n.nr}`}>
                          {NACHTRAG_STATUS.map((s) => (
                            <option key={s} value={s}>
                              {NT_TEXT[s]}
                            </option>
                          ))}
                        </select>
                      </Formular>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!v.nachtraege.length && <p className="leer">Keine Nachträge.</p>}
          </div>
          <h2>Nachtrag erfassen</h2>
          <Formular aktion={nachtragAnlegen.bind(null, id)} knopf="Nachtrag erfassen" zuruecksetzen>
            <Gruppe titel="Nachtrag">
              <Feld label="Leistung" name="text" pflicht breit />
              <Feld label="Betrag brutto €" name="betragBrutto" zahl pflicht hinweis="Minderleistung negativ" />
              <label>
                <span>Status</span>
                <select name="status" defaultValue="angeboten">
                  {NACHTRAG_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {NT_TEXT[s]}
                    </option>
                  ))}
                </select>
              </label>
            </Gruppe>
          </Formular>
        </>
      )}

      {reiter === "konditionen" && <Konditionen v={v} />}
      {reiter === "buergschaften" && (
        <BuergschaftenAbschnitt
          richtung="erhalten"
          vertragId={id}
          pfad={`/handwerkervertraege/${id}`}
          hinweis="Sicherheiten des Handwerkers, z. B. Vertragserfüllungsbürgschaft statt Einbehalt oder Gewährleistungsbürgschaft zur Ablösung des Sicherheitseinbehalts."
        />
      )}
      {reiter === "dokumente" && <Dokumente objektTyp="handwerkervertrag" objektId={id} pfad={`/handwerkervertraege/${id}`} />}
    </>
  );
}

async function Konditionen({ v }: { v: Handwerkervertrag }) {
  const partner = await api<Partner[]>("/partner");
  return (
    <Formular aktion={vertragAendern.bind(null, v.id)}>
      <VertragFelder v={v} gewerkId={v.gewerkId} handwerker={partner} />
    </Formular>
  );
}
