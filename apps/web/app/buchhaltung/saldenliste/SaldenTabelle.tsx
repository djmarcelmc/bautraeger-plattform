"use client";

import { FileUp } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
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

  function vergleichen(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    starte(async () => {
      const r = await mitDatevVergleichen(d.gesellschaft.id, d.stichtag, fd);
      setFehler(r.fehler ?? null);
      if (r.daten) setD(r.daten);
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

      <label className="haken nurabweichungen">
        <input type="checkbox" checked={nurAbweichungen} onChange={(e) => setNur(e.target.checked)} />
        <span>nur Konten mit Abweichung</span>
      </label>

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
