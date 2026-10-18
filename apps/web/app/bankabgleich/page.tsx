import type { OffeneAnforderung, OffenerZahlungsausgang, OffenerZahlungslauf, Sicherheit, Vorschlag } from "@bt/domain";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, FileUp, Sparkles, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl, deZeit } from "@/lib/format";
import type { Gesellschaft } from "@/lib/typen";
import { auszugEinlesen, ignorieren, vorschlaegeUebernehmen, zuordnen, zuruecksetzen } from "./aktionen";

export const dynamic = "force-dynamic";

interface Umsatz {
  id: string;
  buchungsdatum: string;
  betrag: string;
  name: string | null;
  iban: string | null;
  verwendungszweck: string;
  endToEndId: string | null;
  status: "offen" | "zugeordnet" | "ignoriert";
  bemerkung: string | null;
  zugeordnetVon: string | null;
  zugeordnetAm: string | null;
  vorschlag: Vorschlag | null;
  zuordnung: {
    eingaenge: { betrag: string; rechnungsnr: string; zahlungsanforderungId: string }[];
    zahlungslauf: { id: string; nr: string } | null;
    zahlungsausgang: { rechnungsnr: string; rechnungId: string } | null;
  } | null;
}

interface Liste {
  gesellschaft: { id: string; nr: number; name: string; iban: string | null };
  summen: { offen: number; offenEingang: string; offenAusgang: string; zugeordnet: number; ignoriert: number };
  importe: { id: string; dateiname: string; format: string; von: string | null; bis: string | null; anzahl: number; neu: number; importiertVon: string | null; angelegtAm: string }[];
  offen: { anforderungen: (OffeneAnforderung & { faelligAm: string })[]; zahlungslaeufe: OffenerZahlungslauf[]; zahlungsausgaenge: (OffenerZahlungsausgang & { laufNr: string | null })[] };
  umsaetze: Umsatz[];
}

const STATUS = [
  ["offen", "Offen"],
  ["zugeordnet", "Zugeordnet"],
  ["ignoriert", "Ignoriert"],
  ["alle", "Alle"],
] as const;

const SICHERHEIT: Record<Sicherheit, { text: string; klasse: string }> = {
  sicher: { text: "sicher", klasse: "gut" },
  wahrscheinlich: { text: "wahrscheinlich", klasse: "info" },
  moeglich: { text: "möglich", klasse: "warnung" },
};

const euro = (v: string) => `${deZahl(v, 2)} €`;

function vorschlagZuordnung(v: Vorschlag) {
  return JSON.stringify(v.art === "anforderung" ? { art: "anforderung", posten: v.posten.map((p) => ({ id: p.id, betrag: p.betrag })) } : { art: v.art, id: v.id });
}

function vorschlagText(v: Vorschlag) {
  if (v.art === "anforderung") return v.posten.length ? v.posten.map((p) => `${p.rechnungsnr} (${euro(p.betrag)})`).join(" + ") : "keine automatische Zuordnung";
  return v.art === "zahlungslauf" ? `Zahlungslauf ${v.nr}` : `Zahlung Rechnung ${v.rechnungsnr}`;
}

export default async function Bankabgleich({ searchParams }: { searchParams: Promise<{ g?: string; status?: string }> }) {
  const sp = await searchParams;
  const gesellschaften = await api<Gesellschaft[]>("/gesellschaften");
  if (!gesellschaften.length)
    return (
      <>
        <h1>Bankabgleich</h1>
        <div className="karte">
          <p className="leer">
            Bitte zuerst eine <a href="/gesellschaften">Gesellschaft</a> anlegen.
          </p>
        </div>
      </>
    );
  const gid = gesellschaften.some((g) => g.id === sp.g) ? sp.g! : (gesellschaften.find((g) => g.iban) ?? gesellschaften[0]!).id;
  const status = STATUS.some(([w]) => w === sp.status) ? sp.status! : "offen";
  const d = await api<Liste>(`/bankabgleich?gesellschaftId=${gid}&status=${status}`);
  const sichere = d.umsaetze.filter((u) => u.vorschlag?.sicherheit === "sicher" && (u.vorschlag.art !== "anforderung" || u.vorschlag.posten.length)).length;

  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Bankabgleich</h1>
          <p className="untertitel">
            Kontoauszüge einlesen und Zahlungen zuordnen · {d.gesellschaft.nr} {d.gesellschaft.name}
            {d.gesellschaft.iban ? ` · ${d.gesellschaft.iban}` : ""}
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className={`kpi${d.summen.offen ? " kpi-warnung" : ""}`}>
          <span>
            <TriangleAlert size={15} /> offene Umsätze
          </span>
          <b>{d.summen.offen}</b>
          <small>{d.summen.offen ? "noch zuzuordnen" : "alles abgeglichen"}</small>
        </div>
        <div className="kpi">
          <span>
            <ArrowDownLeft size={15} /> Eingänge offen
          </span>
          <b>{euro(d.summen.offenEingang)}</b>
          <small>{d.offen.anforderungen.length} offene Zahlungsanforderungen</small>
        </div>
        <div className="kpi">
          <span>
            <ArrowUpRight size={15} /> Ausgänge offen
          </span>
          <b>{euro(String(-Number(d.summen.offenAusgang)))}</b>
          <small>{d.offen.zahlungslaeufe.length} Zahlungsläufe ohne Kontobeleg</small>
        </div>
        <div className="kpi">
          <span>
            <CircleCheck size={15} /> zugeordnet
          </span>
          <b>{d.summen.zugeordnet}</b>
          <small>{d.summen.ignoriert} ignoriert (z. B. Gebühren)</small>
        </div>
      </div>

      <div className="zweispaltig bank-oben">
        <section className="karte">
          <h2 className="mitsymbol">
            <FileUp size={18} /> Kontoauszug einlesen
          </h2>
          <Formular aktion={auszugEinlesen} knopf="Einlesen" zuruecksetzen className="formular upload">
            <div className="uploadfeld">
              <input type="file" name="datei" accept=".xml,.sta,.mt940,.txt,.940,application/xml,text/xml" required />
            </div>
            <label>
              <span>Gesellschaft</span>
              <select name="gesellschaftId" defaultValue="">
                <option value="">automatisch über die IBAN</option>
                {gesellschaften.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nr} {g.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">CAMT.053 (XML, aus dem Onlinebanking „Kontoauszug als camt“) oder MT940. Bereits eingelesene Umsätze werden erkannt und übersprungen.</p>
          </Formular>
        </section>
        <section className="karte">
          <h2 className="mitsymbol">
            <Sparkles size={18} /> Zuordnung
          </h2>
          <p className="hint">
            Gutschriften werden über Rechnungsnummer, Kaufvertrag oder Betrag und Name den offenen Zahlungsanforderungen zugeordnet, Belastungen über die EndToEnd-ID den
            Zahlungsläufen. Zugeordnete Gutschriften werden als Zahlungseingang verbucht und erscheinen im Buchungsjournal.
          </p>
          <Formular aktion={vorschlaegeUebernehmen.bind(null, gid)} knopf={`Alle sicheren Vorschläge übernehmen (${sichere})`} />
        </section>
      </div>

      <form className="filterleiste">
        <select name="g" defaultValue={gid} aria-label="Gesellschaft">
          {gesellschaften.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nr} {g.name}
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

      {!d.umsaetze.length ? (
        <div className="karte">
          <p className="leer">{status === "offen" ? "Keine offenen Umsätze – alles abgeglichen oder noch kein Auszug eingelesen." : "Keine Umsätze in dieser Ansicht."}</p>
        </div>
      ) : (
        <ul className="bankliste">
          {d.umsaetze.map((u) => {
            const haben = Number(u.betrag) > 0;
            return (
              <li key={u.id} className={`karte bankumsatz ${u.status}`}>
                <div className="bankkopf">
                  <span className={`bankrichtung ${haben ? "ein" : "aus"}`}>{haben ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                  <div className="bankinfo">
                    <b>{u.name ?? (haben ? "Gutschrift" : "Belastung")}</b>
                    <span className="hint">
                      {deDatum(u.buchungsdatum)}
                      {u.iban ? ` · ${u.iban}` : ""}
                      {u.endToEndId ? ` · E2E ${u.endToEndId}` : ""}
                    </span>
                    <p>{u.verwendungszweck || <span className="hint">ohne Verwendungszweck</span>}</p>
                  </div>
                  <b className={`bankbetrag ${haben ? "ein" : "aus"}`}>{euro(u.betrag)}</b>
                </div>

                {u.status === "offen" ? (
                  <div className="bankaktion">
                    {u.vorschlag ? (
                      <div className="bankvorschlag">
                        <span className={`badge ${SICHERHEIT[u.vorschlag.sicherheit].klasse}`}>{SICHERHEIT[u.vorschlag.sicherheit].text}</span>
                        <span>
                          <b>{vorschlagText(u.vorschlag)}</b> <span className="hint">– {u.vorschlag.grund}</span>
                        </span>
                        {u.vorschlag.art !== "anforderung" || u.vorschlag.posten.length ? (
                          <Formular aktion={zuordnen.bind(null, u.id)} knopf="Übernehmen" className="formular inline">
                            <input type="hidden" name="zuordnung" value={vorschlagZuordnung(u.vorschlag)} />
                          </Formular>
                        ) : null}
                      </div>
                    ) : (
                      <p className="hint">Kein Vorschlag gefunden.</p>
                    )}
                    <div className="knopfleiste">
                      <details className="bankerfassung">
                        <summary className="knopf zweitrangig klein">Selbst zuordnen</summary>
                        {haben ? (
                          <Formular aktion={zuordnen.bind(null, u.id)} knopf="Zuordnen">
                            <input type="hidden" name="art" value="anforderung" />
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="raster bankposten">
                                <label>
                                  <span>{i === 1 ? "Zahlungsanforderung" : `weitere (optional)`}</span>
                                  <select name={`anforderung${i}`} defaultValue={i === 1 && u.vorschlag?.art === "anforderung" ? (u.vorschlag.posten[0]?.id ?? "") : ""} required={i === 1}>
                                    <option value="">–</option>
                                    {d.offen.anforderungen.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.rechnungsnr} · {a.kaufvertragNr} · {a.namen[0] ?? ""} · offen {euro(a.offen)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>Betrag</span>
                                  <input name={`betrag${i}`} defaultValue={i === 1 ? deZahl(u.betrag, 2) : ""} inputMode="decimal" className="zahl" />
                                </label>
                              </div>
                            ))}
                            <p className="hint">Die Beträge müssen zusammen den Umsatz ergeben; Überzahlungen bitte gesondert klären.</p>
                          </Formular>
                        ) : (
                          <Formular aktion={zuordnen.bind(null, u.id)} knopf="Zuordnen">
                            <label>
                              <span>Zahlung an Handwerker</span>
                              <select name="ziel" defaultValue="" required>
                                <option value="">–</option>
                                <optgroup label="Zahlungsläufe (Sammelbuchung)">
                                  {d.offen.zahlungslaeufe.map((l) => (
                                    <option key={l.id} value={`zahlungslauf:${l.id}`}>
                                      {l.nr} · {deDatum(l.ausfuehrungAm)} · {euro(l.summe)}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Einzelzahlungen">
                                  {d.offen.zahlungsausgaenge.map((z) => (
                                    <option key={z.id} value={`zahlungsausgang:${z.id}`}>
                                      {z.rechnungsnr} · {z.name} · {euro(z.betrag)}
                                      {z.laufNr ? ` · ${z.laufNr}` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </label>
                          </Formular>
                        )}
                      </details>
                      <details className="bankerfassung">
                        <summary className="knopf zweitrangig klein">Ignorieren</summary>
                        <Formular aktion={ignorieren.bind(null, u.id)} knopf="Als erledigt markieren">
                          <label>
                            <span>Bemerkung</span>
                            <input name="bemerkung" placeholder="z. B. Bankgebühr, Umbuchung, Überzahlung geklärt" maxLength={300} />
                          </label>
                        </Formular>
                      </details>
                    </div>
                  </div>
                ) : (
                  <div className="bankaktion erledigt">
                    <span className={`badge ${u.status === "zugeordnet" ? "gut" : ""}`}>{u.status === "zugeordnet" ? "zugeordnet" : "ignoriert"}</span>
                    <span>
                      {u.zuordnung?.eingaenge.map((e) => (
                        <a key={e.zahlungsanforderungId} href={`/zahlungsanforderungen/${e.zahlungsanforderungId}`} className="bankverweis">
                          {e.rechnungsnr} ({euro(e.betrag)})
                        </a>
                      ))}
                      {u.zuordnung?.zahlungslauf ? (
                        <a href={`/zahlungslaeufe/${u.zuordnung.zahlungslauf.id}`} className="bankverweis">
                          Zahlungslauf {u.zuordnung.zahlungslauf.nr}
                        </a>
                      ) : null}
                      {u.zuordnung?.zahlungsausgang ? (
                        <a href={`/eingangsrechnungen/${u.zuordnung.zahlungsausgang.rechnungId}`} className="bankverweis">
                          Rechnung {u.zuordnung.zahlungsausgang.rechnungsnr}
                        </a>
                      ) : null}
                      {u.bemerkung ? <span className="hint">{u.bemerkung}</span> : null}
                      <span className="hint">
                        {" "}
                        · {u.zugeordnetVon} {u.zugeordnetAm ? deZeit(u.zugeordnetAm) : ""}
                      </span>
                    </span>
                    <Formular
                      aktion={zuruecksetzen.bind(null, u.id)}
                      knopf="Zurücksetzen"
                      knopfArt="zweitrangig"
                      className="formular inline"
                      bestaetigen={u.zuordnung?.eingaenge.length ? "Zuordnung aufheben? Die dabei verbuchten Zahlungseingänge werden gelöscht." : undefined}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {d.importe.length ? (
        <details className="karte">
          <summary>Eingelesene Auszüge ({d.importe.length})</summary>
          <table>
            <thead>
              <tr>
                <th>Eingelesen</th>
                <th>Datei</th>
                <th>Zeitraum</th>
                <th className="num">Umsätze</th>
                <th className="num">neu</th>
                <th>von</th>
              </tr>
            </thead>
            <tbody>
              {d.importe.map((i) => (
                <tr key={i.id}>
                  <td>{deZeit(i.angelegtAm)}</td>
                  <td>
                    {i.dateiname} <span className="badge klein">{i.format === "camt" ? "CAMT" : "MT940"}</span>
                  </td>
                  <td>
                    {deDatum(i.von)} – {deDatum(i.bis)}
                  </td>
                  <td className="num">{i.anzahl}</td>
                  <td className="num">{i.neu}</td>
                  <td>{i.importiertVon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </>
  );
}
