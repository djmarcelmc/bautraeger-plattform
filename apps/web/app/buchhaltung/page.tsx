import { QUELLEN, type Kontierung, type QuelleTyp } from "@bt/domain";
import { BookOpenCheck, FileClock, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Gesellschaft } from "@/lib/typen";
import { kontierungSpeichern, kontierungZuruecksetzen } from "./aktionen";
import { ExportFormular } from "./ExportFormular";

export const dynamic = "force-dynamic";

interface Zeile {
  id: string;
  belegdatum: string;
  belegnr: string | null;
  konto: string;
  gegenkonto: string;
  betrag: string;
  sollHaben: "S" | "H";
  steuerschluessel: string | null;
  buchungstext: string | null;
  kostenstelle: string | null;
  quelleTyp: QuelleTyp;
  exportiertAm: string | null;
  exportStapel: string | null;
  stornoVon: string | null;
  storniert: boolean;
  verweis: string | null;
}

interface Journal {
  gesellschaft: { id: string; nr: number; name: string; skr: string | null; sachkontenlaenge: number | null; datevBereit: boolean };
  kontierung: Kontierung;
  kontierungGespeichert: boolean;
  abgleich: { neu: number; geaendert: number; geloescht: number; storniert: number };
  ohnePartner: { typ: QuelleTyp; id: string }[];
  summen: { anzahl: number; neu: number; summeNeu: string; stornos: number };
  gekuerzt: boolean;
  zeilen: Zeile[];
}

const STATUS = [
  ["alle", "Alle"],
  ["neu", "Nicht exportiert"],
  ["exportiert", "Exportiert"],
] as const;

const QUELLFILTER = [
  ["", "Alle Vorgänge"],
  ["zahlungsanforderung", "Zahlungsanforderungen"],
  ["zahlungseingang", "Zahlungseingänge"],
  ["eingangsrechnung", "Eingangsrechnungen"],
  ["zahlungsausgang", "Zahlungsausgänge"],
  ["bauabzug_abfuehrung", "Bauabzugsteuer"],
] as const;

const KONTEN: [keyof Kontierung, string, string?][] = [
  ["bank", "Bank"],
  ["anzahlungen", "Erhaltene Anzahlungen (Zahlungsanforderungen)"],
  ["anzahlungenBu", "BU-Schlüssel Anzahlungen", "optional"],
  ["bauleistungen", "Bauleistungen / Fremdleistungen"],
  ["bauleistungenBu", "BU-Schlüssel Bauleistungen", "optional, z. B. für § 13b UStG"],
  ["skonto", "Erhaltene Skonti"],
  ["bauabzug", "Verbindlichkeit Bauabzugsteuer"],
  ["debitorBasis", "Debitoren ab", "Basis + Partnernummer"],
  ["kreditorBasis", "Kreditoren ab", "Basis + Partnernummer"],
];

export default async function Buchhaltung({ searchParams }: { searchParams: Promise<{ g?: string; von?: string; bis?: string; status?: string; quelle?: string }> }) {
  const sp = await searchParams;
  const gesellschaften = await api<Gesellschaft[]>("/gesellschaften");
  if (!gesellschaften.length)
    return (
      <>
        <h1>Buchhaltung</h1>
        <div className="karte">
          <p className="leer">
            Bitte zuerst eine <a href="/gesellschaften">Gesellschaft</a> anlegen.
          </p>
        </div>
      </>
    );
  const gid = gesellschaften.some((g) => g.id === sp.g) ? sp.g! : gesellschaften[0]!.id;
  const jahr = new Date().getFullYear();
  const von = sp.von || `${jahr}-01-01`;
  const bis = sp.bis || `${jahr}-12-31`;
  const status = STATUS.some(([w]) => w === sp.status) ? sp.status! : "alle";
  const quelle = QUELLFILTER.some(([w]) => w === sp.quelle) ? sp.quelle! : "";
  const q = new URLSearchParams({ gesellschaftId: gid, von, bis, status, ...(quelle ? { quelle } : {}) });
  const j = await api<Journal>(`/buchhaltung/journal?${q}`);
  const k = j.kontierung;
  const sachkonto = new Map<string, string>([
    [k.bank, "Bank"],
    [k.anzahlungen, "Erh. Anzahlungen"],
    [k.bauleistungen, "Bauleistungen"],
    [k.skonto, "Skonti"],
    [k.bauabzug, "Bauabzugsteuer"],
  ]);
  const laenge = j.gesellschaft.sachkontenlaenge ?? 4;
  const kontoText = (nr: string) => sachkonto.get(nr) ?? (nr.length > laenge ? (Number(nr) >= k.kreditorBasis ? "Kreditor" : "Debitor") : "");
  const a = j.abgleich;
  const abgleichText = [a.neu && `${a.neu} neu gebucht`, a.geaendert && `${a.geaendert} angepasst`, a.geloescht && `${a.geloescht} entfernt`, a.storniert && `${a.storniert} storniert`].filter(Boolean).join(", ");

  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Buchhaltung</h1>
          <p className="untertitel">
            Buchungsjournal aus Verkauf und Kosten · DATEV-Export für {j.gesellschaft.nr} {j.gesellschaft.name}
          </p>
        </div>
      </div>

      {abgleichText ? (
        <div className="hinweisbox erfolg">
          <RefreshCw size={16} />
          <span>Automatisch aktualisiert: {abgleichText}.</span>
        </div>
      ) : null}
      {j.ohnePartner.length ? (
        <div className="hinweisbox">
          <TriangleAlert size={16} />
          <span>
            {j.ohnePartner.length} Vorgang/Vorgänge ohne Geschäftspartner ({[...new Set(j.ohnePartner.map((o) => QUELLEN[o.typ]))].join(", ")}) können nicht gebucht werden – bitte
            Käufer bzw. Handwerker im Vertrag eintragen.
          </span>
        </div>
      ) : null}

      <div className="kpis">
        <div className="kpi">
          <span>
            <BookOpenCheck size={15} /> Buchungen im Zeitraum
          </span>
          <b>{j.summen.anzahl}</b>
          <small>{status === "alle" && !quelle ? "alle Vorgänge" : "gefiltert"}</small>
        </div>
        <div className={`kpi${j.summen.neu ? " kpi-warnung" : ""}`}>
          <span>
            <FileClock size={15} /> noch nicht exportiert
          </span>
          <b>{j.summen.neu}</b>
          <small>{deZahl(j.summen.summeNeu, 2)} € Umsatz</small>
        </div>
        <div className="kpi">
          <span>
            <Undo2 size={15} /> Stornobuchungen
          </span>
          <b>{j.summen.stornos}</b>
          <small>nach Änderungen an bereits exportierten Vorgängen</small>
        </div>
      </div>

      <form className="filterleiste">
        <select name="g" defaultValue={gid} aria-label="Gesellschaft">
          {gesellschaften.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nr} {g.name}
            </option>
          ))}
        </select>
        <label>
          <span>von</span>
          <input type="date" name="von" defaultValue={von} />
        </label>
        <label>
          <span>bis</span>
          <input type="date" name="bis" defaultValue={bis} />
        </label>
        <select name="quelle" defaultValue={quelle} aria-label="Vorgang">
          {QUELLFILTER.map(([w, t]) => (
            <option key={w} value={w}>
              {t}
            </option>
          ))}
        </select>
        <div className="segment">
          {STATUS.map(([w, t]) => (
            <label key={w}>
              <input type="radio" name="status" value={w} defaultChecked={status === w} />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <button type="submit" className="zweitrangig">
          Filtern
        </button>
      </form>

      <div className="zweispaltig buchhaltung-oben">
        <section className="karte">
          <h2>DATEV-Export</h2>
          <p className="hint">
            Buchungsstapel im EXTF-Format (Berater {j.gesellschaft.datevBereit ? "eingetragen" : "fehlt"}, SKR {j.gesellschaft.skr ?? "03"}, Sachkontenlänge {laenge}). Exportierte Buchungen
            werden festgeschrieben; spätere Änderungen am Vorgang erscheinen als Storno und Neubuchung.
          </p>
          <ExportFormular gesellschaftId={gid} von={von.slice(0, 4) === bis.slice(0, 4) ? von : `${bis.slice(0, 4)}-01-01`} bis={bis} bereit={j.gesellschaft.datevBereit} neu={j.summen.neu} />
        </section>
        <section className="karte">
          <details className="kontierung" open={!j.kontierungGespeichert && j.summen.anzahl === 0}>
            <summary>
              <h2>Kontenzuordnung</h2>
              <span className={`badge ${j.kontierungGespeichert ? "gut" : "warnung"}`}>{j.kontierungGespeichert ? "eingestellt" : `Standard SKR ${j.gesellschaft.skr ?? "03"}`}</span>
            </summary>
            <p className="hint">Vorschlag nach Anzahlungsmethode (Bauträgerumsätze steuerfrei nach § 4 Nr. 9a UStG, daher ohne Vorsteuer) – bitte mit dem Steuerberater abstimmen.</p>
            <Formular aktion={kontierungSpeichern.bind(null, gid)} knopf="Kontenzuordnung speichern">
              <div className="raster">
                {KONTEN.map(([name, label, hinweis]) => (
                  <label key={name}>
                    <span>{label}</span>
                    <input name={name} defaultValue={k[name] === null ? "" : String(k[name])} inputMode="numeric" className="zahl" />
                    {hinweis ? <small className="hint">{hinweis}</small> : null}
                  </label>
                ))}
              </div>
            </Formular>
            {j.kontierungGespeichert ? (
              <Formular aktion={kontierungZuruecksetzen.bind(null, gid)} knopf="Standardkonten verwenden" knopfArt="zweitrangig" bestaetigen="Kontenzuordnung auf den Standard des Kontenrahmens zurücksetzen?" />
            ) : null}
          </details>
        </section>
      </div>

      <section className="karte ohne-innenabstand">
        {!j.zeilen.length ? (
          <p className="leer">Im Zeitraum gibt es keine Buchungen. Gebucht werden Zahlungsanforderungen, Zahlungseingänge, freigegebene Rechnungen, Zahlungen und abgeführte Bauabzugsteuer.</p>
        ) : (
          <div className="tabellenrahmen">
            <table className="journal">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Beleg</th>
                  <th>Buchungstext</th>
                  <th>Soll</th>
                  <th>Haben</th>
                  <th className="num">Betrag €</th>
                  <th>KSt</th>
                  <th>Vorgang</th>
                  <th>Stand</th>
                </tr>
              </thead>
              <tbody>
                {j.zeilen.map((z) => {
                  // Haben-Kennzeichen (Storno): Soll und Haben sind vertauscht
                  const [soll, haben] = z.sollHaben === "S" ? [z.konto, z.gegenkonto] : [z.gegenkonto, z.konto];
                  return (
                    <tr key={z.id} className={z.storniert ? "storniert" : z.stornoVon ? "storno" : undefined}>
                      <td>{deDatum(z.belegdatum)}</td>
                      <td className="mono">{z.belegnr ?? "–"}</td>
                      <td>
                        {z.buchungstext}
                        {z.steuerschluessel ? <span className="hint"> · BU {z.steuerschluessel}</span> : null}
                      </td>
                      <td className="konto">
                        <b className="mono">{soll}</b>
                        <small>{kontoText(soll)}</small>
                      </td>
                      <td className="konto">
                        <b className="mono">{haben}</b>
                        <small>{kontoText(haben)}</small>
                      </td>
                      <td className="num fett">{deZahl(z.betrag, 2)}</td>
                      <td>{z.kostenstelle ?? ""}</td>
                      <td>{z.verweis ? <a href={z.verweis}>{QUELLEN[z.quelleTyp]}</a> : QUELLEN[z.quelleTyp]}</td>
                      <td>
                        {z.stornoVon ? <span className="badge gefahr">Storno</span> : z.storniert ? <span className="badge">storniert</span> : null}{" "}
                        {z.exportiertAm ? (
                          <span className="badge gut" title={z.exportStapel ?? undefined}>
                            exportiert {deDatum(z.exportiertAm)}
                          </span>
                        ) : (
                          <span className="badge info">neu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {j.gekuerzt ? <p className="hint">Es werden die ersten 2.000 Buchungen gezeigt – bitte den Zeitraum eingrenzen.</p> : null}
      </section>
    </>
  );
}
