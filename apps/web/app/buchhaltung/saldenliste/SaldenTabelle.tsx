"use client";

import { FileSpreadsheet, FileUp } from "lucide-react";
import { Fragment, useRef, useState, useTransition } from "react";
import { mitDatevVergleichen, type Saldenliste } from "./aktionen";

const zahl = (v: string) => Math.abs(Number(v)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Saldo mit Soll/Haben-Kennzeichen */
const sh = (v: string | null) => (v === null ? "–" : Number(v) === 0 ? "0,00" : `${zahl(v)} ${Number(v) > 0 ? "S" : "H"}`);
const diff = (v: string | null) => (v === null ? "–" : Number(v) === 0 ? "✓" : `${Number(v) > 0 ? "+" : "−"}${zahl(v)}`);
const ok = (v: string | null) => v === null || Number(v) === 0;

export function SaldenTabelle({ start }: { start: Saldenliste }) {
  const [d, setD] = useState(start);
  const [fehler, setFehler] = useState<string[] | null>(null);
  const [nurAbweichungen, setNur] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const datevDatei = useRef<File | null>(null);
  const [exportLaeuft, setExport] = useState(false);

  /** Excel herunterladen – mit DATEV-Vergleich wird die zuletzt verglichene CSV erneut mitgeschickt. */
  async function excel() {
    setExport(true);
    try {
      const fd = new FormData();
      fd.set("gesellschaftId", d.gesellschaft.id);
      fd.set("stichtag", d.stichtag);
      let res: Response;
      if (d.mitDatev && datevDatei.current) {
        fd.set("datei", datevDatei.current);
        res = await fetch("/buchhaltung/saldenliste/excel", { method: "POST", body: fd });
      } else res = await fetch(`/buchhaltung/saldenliste/excel?g=${d.gesellschaft.id}&stichtag=${d.stichtag}`);
      if (!res.ok) {
        setFehler([await res.text()]);
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "Saldenliste.xlsx";
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
    } finally {
      setExport(false);
    }
  }

  function vergleichen(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const datei = fd.get("datei");
    starte(async () => {
      const r = await mitDatevVergleichen(d.gesellschaft.id, d.stichtag, fd);
      setFehler(r.fehler ?? null);
      if (r.daten) {
        setD(r.daten);
        datevDatei.current = datei instanceof File ? datei : null;
      }
    });
  }

  const gruppen = [
    ["debitor", "Debitoren (Käufer)"],
    ["kreditor", "Kreditoren (Handwerker)"],
  ] as const;

  return (
    <>
      <section className="karte">
        <form className="formular saldenupload" onSubmit={vergleichen}>
          <div>
            <h2 className="mitsymbol">
              <FileUp size={18} /> Mit DATEV-Saldenliste vergleichen
            </h2>
            <p className="hint">
              CSV-Export der Summen- und Saldenliste (Personenkonten) aus DATEV bzw. vom Steuerberater zum selben Stichtag. Erkannt werden „Konto“ und „Saldo“ mit „S/H“ oder „Saldo Soll“/„Saldo Haben“.
              Die Datei wird nicht gespeichert.
            </p>
          </div>
          <div className="uploadfeld">
            <input type="file" name="datei" accept=".csv,.txt,text/csv" required />
          </div>
          <div className="aktionen">
            <button type="submit" disabled={laeuft}>
              {laeuft ? "Vergleiche …" : "Vergleichen"}
            </button>
          </div>
        </form>
        {fehler ? (
          <div className="fehler" role="alert">
            {fehler.join(" ")}
          </div>
        ) : null}
      </section>

      <div className="saldenleiste">
        <label className="haken nurabweichungen">
          <input type="checkbox" checked={nurAbweichungen} onChange={(e) => setNur(e.target.checked)} />
          <span>nur Konten mit Abweichung</span>
        </label>
        <button type="button" className="zweitrangig" onClick={excel} disabled={exportLaeuft}>
          <FileSpreadsheet size={16} /> {exportLaeuft ? "Excel wird erstellt …" : d.mitDatev ? "Excel mit DATEV-Vergleich" : "Excel"}
        </button>
      </div>

      {gruppen.map(([art, titel]) => {
        const zeilen = d.zeilen.filter((z) => z.art === art && (!nurAbweichungen || !ok(z.differenzOp) || !ok(z.differenzDatev)));
        const s = d.summen[art];
        return (
          <section key={art} className="karte ohne-innenabstand saldengruppe">
            <div className="saldenkopf">
              <h2>{titel}</h2>
              {s.abweichungen ? <span className="badge gefahr">{s.abweichungen} Abweichung(en)</span> : <span className="badge gut">stimmt überein</span>}
            </div>
            {!zeilen.length ? (
              <p className="leer">{nurAbweichungen ? "Keine Abweichungen." : "Keine Salden zum Stichtag."}</p>
            ) : (
              <div className="tabellenrahmen">
                <table className="saldentabelle">
                  <thead>
                    <tr>
                      <th>Konto</th>
                      <th>Name</th>
                      <th className="num">Saldo Journal</th>
                      <th className="num">Offene Posten</th>
                      <th className="num">Differenz</th>
                      {d.mitDatev ? <th className="num">Saldo DATEV</th> : null}
                      {d.mitDatev ? <th className="num">Differenz</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((z) => (
                      <Fragment key={z.konto}>
                        <tr className={ok(z.differenzOp) && ok(z.differenzDatev) ? undefined : "abweichung"} onClick={() => setOffen(offen === z.konto ? null : z.konto)}>
                          <td className="mono">{z.konto}</td>
                          <td>
                            {z.name || <span className="hint">unbekannt</span>}
                            {z.posten.length ? <span className="hint"> · {z.posten.length} Posten</span> : null}
                          </td>
                          <td className="num">{sh(z.journal)}</td>
                          <td className="num">{sh(z.op)}</td>
                          <td className={`num ${ok(z.differenzOp) ? "gut" : "gefahr"}`}>{diff(z.differenzOp)}</td>
                          {d.mitDatev ? <td className="num">{sh(z.datev)}</td> : null}
                          {d.mitDatev ? <td className={`num ${ok(z.differenzDatev) ? "gut" : "gefahr"}`}>{diff(z.differenzDatev)}</td> : null}
                        </tr>
                        {offen === z.konto && z.posten.length ? (
                          <tr className="postenzeile">
                            <td />
                            <td colSpan={d.mitDatev ? 6 : 4}>
                              <ul>
                                {z.posten.map((p) => (
                                  <li key={p.beleg + p.link}>
                                    <a href={p.link}>{p.beleg}</a> <span className="hint">offen {sh(p.offen)}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Summe</td>
                      <td className="num">{sh(s.journal)}</td>
                      <td className="num">{sh(s.op)}</td>
                      <td />
                      {d.mitDatev ? <td className="num">{sh(s.datev)}</td> : null}
                      {d.mitDatev ? <td /> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
