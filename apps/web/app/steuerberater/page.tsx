import { BookOpenCheck, Download, FileWarning, Landmark, Scale, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";

export const dynamic = "force-dynamic";

const buchungen = (n: number) => `${n} ${n === 1 ? "Buchung" : "Buchungen"}`;

interface Uebersicht {
  stichtag: string;
  gesellschaften: {
    gesellschaft: { id: string; nr: number; name: string; steuernummer: string | null; skr: string | null };
    datev: { bereit: boolean; nichtExportiert: number; aeltestes: string | null; letzteExporte: { stapel: string; exportiertAm: string; anzahl: number; von: string; bis: string }[] };
    bauabzug: { monat: string; monatText: string; faelligAm: string; offen: number; nichtAbgefuehrt: number; abzugsbetrag: string }[];
    rechnungenOhneScan: number;
  }[];
}

/** Startseite für den Steuerberater: je Gesellschaft DATEV-Export, Saldenliste, Bauabzugsteuer und Belege. */
export default async function Steuerberater() {
  const d = await api<Uebersicht>("/steuerberater");
  const vorjahr = Number(d.stichtag.slice(0, 4)) - 1;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Steuerberater</h1>
          <p className="untertitel">Buchungen und Belege für DATEV, Abstimmung der Personenkonten, Bauabzugsteuer und MaBV-Prüfung – je Gesellschaft auf einen Blick.</p>
        </div>
      </div>
      {!d.gesellschaften.length ? <p className="leer">Noch keine Gesellschaft angelegt.</p> : null}
      <div className="stb-raster">
        {d.gesellschaften.map(({ gesellschaft: g, datev, bauabzug, rechnungenOhneScan }) => (
          <section key={g.id} className="karte stb-karte">
            <div className="stb-kopf">
              <div>
                <h2>
                  {g.nr} {g.name}
                </h2>
                <span className="hint">
                  SKR {g.skr ?? "03"}
                  {g.steuernummer ? ` · St.-Nr. ${g.steuernummer}` : ""}
                </span>
              </div>
              {datev.nichtExportiert ? <span className="badge warnung">{buchungen(datev.nichtExportiert)} offen</span> : <span className="badge gut">alles exportiert</span>}
            </div>

            <div className="stb-block">
              <h3 className="mitsymbol">
                <BookOpenCheck size={16} /> DATEV
              </h3>
              {!datev.bereit ? (
                <p className="warntext">DATEV-Berater- und Mandantennummer fehlen bei der Gesellschaft.</p>
              ) : datev.nichtExportiert ? (
                <p>
                  {buchungen(datev.nichtExportiert)} noch nicht exportiert{datev.aeltestes ? `, die älteste vom ${deDatum(datev.aeltestes)}` : ""}.
                </p>
              ) : (
                <p className="hint">Alle Buchungen sind exportiert.</p>
              )}
              <div className="knopfleiste">
                {datev.bereit ? (
                  <a className="knopf" href={`/buchhaltung?g=${g.id}&status=neu`}>
                    <Download size={15} /> DATEV-Export mit Belegen
                  </a>
                ) : (
                  <a className="knopf" href={`/gesellschaften/${g.id}`}>
                    DATEV-Nummern eintragen
                  </a>
                )}
                <a className="knopf zweitrangig" href={`/buchhaltung/saldenliste?g=${g.id}`}>
                  <Scale size={15} /> Saldenliste &amp; OP-Abgleich
                </a>
              </div>
              {datev.letzteExporte.length ? (
                <ul className="stb-liste">
                  {datev.letzteExporte.map((s) => (
                    <li key={s.stapel}>
                      <span>
                        {deDatum(s.exportiertAm)} · {buchungen(s.anzahl)} ({deDatum(s.von)} – {deDatum(s.bis)})
                      </span>
                      <span>
                        <a href={`/buchhaltung/stapel/${s.stapel}?g=${g.id}`}>Stapel</a> · <a href={`/buchhaltung/stapel/${s.stapel}?g=${g.id}&belege=1`}>mit Belegen</a>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {rechnungenOhneScan ? (
                <p className="warntext mitsymbol">
                  <FileWarning size={14} /> {rechnungenOhneScan} {rechnungenOhneScan === 1 ? "Rechnung" : "Rechnungen"} ohne Scan – Beleg fehlt im DATEV-Paket
                </p>
              ) : null}
            </div>

            <div className="stb-block">
              <h3 className="mitsymbol">
                <Landmark size={16} /> Bauabzugsteuer
              </h3>
              {bauabzug.length ? (
                <ul className="stb-liste">
                  {bauabzug.map((m) => (
                    <li key={m.monat}>
                      <span>
                        {m.monatText} · {deZahl(m.abzugsbetrag)} € · Termin {deDatum(m.faelligAm)}
                      </span>
                      {m.offen ? <span className="badge warnung">{m.offen} anzumelden</span> : m.nichtAbgefuehrt ? <span className="badge info">nicht abgeführt</span> : <span className="badge gut">erledigt</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Keine einbehaltene Bauabzugsteuer in den letzten 12 Monaten.</p>
              )}
              <a href="/bauabzug">Zur Bauabzugsteuer (Abrechnungsbelege, Anmeldungen)</a>
            </div>

            <div className="stb-block">
              <h3 className="mitsymbol">
                <ShieldCheck size={16} /> MaBV-Prüfung
              </h3>
              <a href={`/auswertungen/mabv-pruefbericht?gesellschaftId=${g.id}&von=${vorjahr}-01-01&bis=${vorjahr}-12-31`}>Prüfhilfe nach § 16 MaBV für {vorjahr}</a>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
