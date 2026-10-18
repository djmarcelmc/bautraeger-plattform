import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Check, Printer, X } from "lucide-react";
import { Dokumente } from "@/components/Dokumente";
import { Feld, Gruppe, Haken, Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { RatenStatus } from "@/components/RatenStatus";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type ProtokollEintrag, type VertragDetail } from "@/lib/typen";
import { konditionenSpeichern, ratenAnfordern, zahlungErfassen } from "../../verkauf/aktionen";

export const dynamic = "force-dynamic";

const REITER = [
  ["raten", "Raten"],
  ["zahlungen", "Zahlungen"],
  ["konditionen", "Konditionen"],
  ["dokumente", "Dokumente"],
  ["protokoll", "Protokoll"],
] as const;

export default async function KaufvertragSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reiter?: string }>;
}) {
  const { id } = await params;
  const { reiter = "raten" } = await searchParams;
  const v = await api<VertragDetail>(`/kaufvertraege/${id}`);
  const heute = new Date().toISOString().slice(0, 10);
  const pfad = `/kaufvertraege/${id}`;
  const anforderbar = v.raten.filter((r) => r.status === "anforderbar");
  const quote = (x: string) => (Number(v.summen.vertragssumme) ? (Number(x) / Number(v.summen.vertragssumme)) * 100 : 0);

  return (
    <>
      <p className="brotkrumen">
        <a href="/verkauf">Verkauf</a> › <a href={`/projekte/${v.projekt.id}`}>{v.projekt.nr} {v.projekt.suchcode}</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>Kaufvertrag {v.nr}</h1>
          <div className="metazeile">
            <span>{v.kaeufer.map((k) => partnerName(k)).join(" & ")}</span>
            <span>
              {v.einheiten.map((e) => `${EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ} ${e.nr}`).join(", ")}
            </span>
            {v.datum ? <span>Vertrag vom {deDatum(v.datum)}</span> : null}
            {v.urkundennr ? <span>UR-Nr. {v.urkundennr}</span> : null}
          </div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Vertragssumme brutto</span>
          <b>{deZahl(v.summen.vertragssumme)} €</b>
          <small>{v.raten.length} Raten nach MaBV</small>
        </div>
        <div className="kpi">
          <span>Angefordert</span>
          <b>{deZahl(v.summen.angefordert)} €</b>
          <div className="balken">
            <div style={{ width: `${quote(v.summen.angefordert)}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span>Bezahlt</span>
          <b>{deZahl(v.summen.bezahlt)} €</b>
          <small>{Math.round(quote(v.summen.bezahlt))} % der Vertragssumme</small>
        </div>
        <div className={`kpi${Number(v.summen.offen) > 0 ? " kpi-warnung" : ""}`}>
          <span>Offen</span>
          <b>{deZahl(v.summen.offen)} €</b>
          <small>noch nicht angefordert: {deZahl(v.summen.nichtAngefordert, 0)} €</small>
        </div>
      </div>

      <div className="karte voraussetzungen">
        <b>Fälligkeitsvoraussetzungen</b>
        {v.voraussetzungen.buergschaftNach7 ? (
          <span className="ok">
            <Check size={16} /> Bürgschaft nach § 7 MaBV
          </span>
        ) : (
          <>
            {(
              [
                ["Vertrag wirksam", v.voraussetzungen.vertragWirksam],
                ["Auflassungsvormerkung", v.voraussetzungen.vormerkungEingetragen],
                ["Lastenfreistellung", v.voraussetzungen.lastenfreistellungGesichert],
              ] as const
            ).map(([t, ok]) => (
              <span key={t} className={ok ? "ok" : "fehlt"}>
                {ok ? <Check size={16} /> : <X size={16} />} {t}
              </span>
            ))}
          </>
        )}
        {v.voraussetzungen.anforderungssperre ? <span className="fehlt">Anforderungssperre aktiv</span> : null}
        {!v.voraussetzungen.erfuellt ? (
          <a href="?reiter=konditionen" className="rechts">
            bearbeiten →
          </a>
        ) : null}
      </div>

      <nav className="reiter">
        {REITER.map(([k, t]) => (
          <a key={k} href={`?reiter=${k}`} className={reiter === k ? "aktiv" : undefined}>
            {t}
          </a>
        ))}
      </nav>

      {reiter === "raten" && (
        <Formular aktion={ratenAnfordern.bind(null, id)} knopf={anforderbar.length ? "Ausgewählte Raten anfordern" : null} className="formular">
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="num">Rate</th>
                  <th className="num">%</th>
                  <th className="num">Betrag €</th>
                  <th>Bauabschnitt</th>
                  <th>Status</th>
                  <th>Rechnung</th>
                  <th className="num">Bezahlt €</th>
                </tr>
              </thead>
              <tbody>
                {v.raten.map((r) => (
                  <tr key={r.id} className={r.status === "anforderbar" ? "hervorgehoben" : undefined}>
                    <td>{r.status === "anforderbar" ? <input type="checkbox" name="rate" value={r.id} defaultChecked aria-label={`Rate ${r.nr} anfordern`} /> : null}</td>
                    <td className="num">{r.nr}</td>
                    <td className="num">{deZahl(r.prozent)}</td>
                    <td className="num">{deZahl(r.betrag)}</td>
                    <td className="ratentext">{r.text}</td>
                    <td>
                      <RatenStatus status={r.status} />
                    </td>
                    <td>
                      {r.zahlungsanforderungId ? <a href={`/zahlungsanforderungen/${r.zahlungsanforderungId}`}>{r.rechnungsnr}</a> : ""}
                      {r.faelligAm ? <div className="hint">fällig {deDatum(r.faelligAm)}</div> : null}
                    </td>
                    <td className="num">{Number(r.bezahlt) ? deZahl(r.bezahlt) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td />
                  <td className="num">100,00</td>
                  <td className="num">
                    <b>{deZahl(v.summen.vertragssumme)}</b>
                  </td>
                  <td colSpan={3} />
                  <td className="num">
                    <b>{deZahl(v.summen.bezahlt)}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {anforderbar.length ? (
            <div className="raster anfordern">
              <Feld label="Datum der Anforderung" name="datum" typ="date" wert={heute} pflicht />
              <p className="hint breit">
                {anforderbar.length} Rate(n) anforderbar. Mehrere ausgewählte Raten werden zu einer Zahlungsanforderung zusammengefasst; fällig nach{" "}
                {v.zahlungszielTage} Tagen.
              </p>
            </div>
          ) : (
            <p className="hint">
              Zurzeit ist keine Rate anforderbar. Raten werden anforderbar, sobald der Bautenstand gemeldet ist (Projekt › Bautenstand) und die
              Fälligkeitsvoraussetzungen erfüllt sind.
            </p>
          )}
        </Formular>
      )}

      {reiter === "zahlungen" && (
        <>
          <div className="karte ohne-innenabstand">
            <table>
              <thead>
                <tr>
                  <th>Rechnung</th>
                  <th>Raten</th>
                  <th>angefordert</th>
                  <th>fällig</th>
                  <th className="num">Betrag €</th>
                  <th className="num">Bezahlt €</th>
                  <th className="num">Offen €</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {v.anforderungen.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <a href={`/zahlungsanforderungen/${a.id}`}>{a.rechnungsnr}</a>
                    </td>
                    <td>{a.raten.join(", ")}</td>
                    <td>{deDatum(a.angefordertAm)}</td>
                    <td>
                      {deDatum(a.faelligAm)} {a.ueberfaellig ? <span className="badge gefahr">überfällig</span> : null}
                    </td>
                    <td className="num">{deZahl(a.betrag)}</td>
                    <td className="num">{deZahl(a.bezahlt)}</td>
                    <td className="num">{Number(a.offen) ? <b>{deZahl(a.offen)}</b> : <span className="badge gut">bezahlt</span>}</td>
                    <td>
                      <a href={`/zahlungsanforderungen/${a.id}`} className="symbol" title="Druckansicht">
                        <Printer size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!v.anforderungen.length && <p className="leer">Noch keine Zahlungsanforderungen.</p>}
          </div>
          {v.anforderungen.some((a) => Number(a.offen) > 0) && (
            <>
              <h2>Zahlungseingang erfassen</h2>
              <Formular aktion={zahlungErfassen.bind(null, pfad)} knopf="Zahlung verbuchen" zuruecksetzen>
                <Gruppe titel="Zahlung">
                  <label>
                    <span>Zahlungsanforderung *</span>
                    <select name="zahlungsanforderungId" required>
                      {v.anforderungen
                        .filter((a) => Number(a.offen) > 0)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.rechnungsnr} – offen {deZahl(a.offen)} €
                          </option>
                        ))}
                    </select>
                  </label>
                  <Feld label="Eingang am" name="datum" typ="date" wert={heute} pflicht />
                  <Feld label="Betrag €" name="betrag" zahl pflicht />
                  <Feld label="Verwendungszweck" name="verwendungszweck" />
                </Gruppe>
              </Formular>
            </>
          )}
          {v.eingaenge.length ? (
            <>
              <h2>Zahlungseingänge</h2>
              <div className="karte ohne-innenabstand">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Rechnung</th>
                      <th>Verwendungszweck</th>
                      <th className="num">Betrag €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.eingaenge.map((e) => (
                      <tr key={e.id}>
                        <td>{deDatum(e.datum)}</td>
                        <td>{v.anforderungen.find((a) => a.id === e.zahlungsanforderungId)?.rechnungsnr}</td>
                        <td>{e.verwendungszweck}</td>
                        <td className="num">{deZahl(e.betrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      )}

      {reiter === "konditionen" && (
        <Formular aktion={konditionenSpeichern.bind(null, id)}>
          <Gruppe titel="Vertrag">
            <Feld label="Datum" name="datum" typ="date" wert={v.datum} />
            <Feld label="Urkundennummer" name="urkundennr" wert={v.urkundennr} />
            <label>
              <span>Rechnungsempfänger</span>
              <select name="zahlungsanforderungAn" defaultValue={v.zahlungsanforderungAn ?? ""}>
                {v.kaeufer.map((k) => (
                  <option key={k.id} value={k.id}>
                    {partnerName(k)}
                  </option>
                ))}
              </select>
            </label>
            <Feld label="Zahlungsziel (Tage)" name="zahlungszielTage" wert={v.zahlungszielTage} zahl />
            <Feld label="Verzugszins %" name="verzugszinsProzent" wert={deZahl(v.verzugszinsProzent)} zahl hinweis="leer = gesetzlich (§ 288 BGB)" />
          </Gruppe>
          <Gruppe titel="Fälligkeitsvoraussetzungen (§ 3 Abs. 1 MaBV)">
            <Haken label="Vertrag wirksam" name="vertragWirksam" wert={v.vertragWirksam} />
            <Feld label="Auflassungsvormerkung eingetragen am" name="vormerkungEingetragenAm" typ="date" wert={v.vormerkungEingetragenAm} />
            <Haken label="Lastenfreistellung gesichert" name="lastenfreistellungGesichert" wert={v.lastenfreistellungGesichert} />
            <Haken label="Bürgschaft nach § 7 MaBV" name="buergschaftNach7" wert={v.buergschaftNach7} />
          </Gruppe>
          <Gruppe titel="Sperren">
            <Haken label="Anforderungssperre" name="anforderungssperre" wert={v.anforderungssperre} />
            <Haken label="Mahnsperre" name="mahnsperre" wert={v.mahnsperre} />
          </Gruppe>
        </Formular>
      )}

      {reiter === "dokumente" && <Dokumente objektTyp="kaufvertrag" objektId={id} pfad={pfad} />}
      {reiter === "protokoll" && <ProtokollReiter id={id} />}
    </>
  );
}

async function ProtokollReiter({ id }: { id: string }) {
  const eintraege = await api<ProtokollEintrag[]>(`/protokoll/${id}`);
  return (
    <div className="karte">
      <Protokoll eintraege={eintraege} />
    </div>
  );
}
