import type { BauabzugMonat, BauabzugStatus } from "@bt/domain";
import { CalendarClock, CircleAlert, FileText, Landmark, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName } from "@/lib/typen";
import { anmeldungSpeichern, anmeldungZuruecknehmen } from "./aktionen";

export const dynamic = "force-dynamic";

interface Uebersicht {
  stichtag: string;
  monate: BauabzugMonat[];
  gesellschaften: { id: string; nr: number; name: string; steuernummer: string | null }[];
  handwerker: { id: string; nr: number; suchcode: string; firma: string | null; vorname: string | null; nachname: string | null; steuernummer: string | null; finanzamt: string | null }[];
}

const STATUS: Record<BauabzugStatus, { text: string; klasse: string }> = {
  offen: { text: "anzumelden", klasse: "warnung" },
  angemeldet: { text: "angemeldet", klasse: "info" },
  abgefuehrt: { text: "abgeführt", klasse: "gut" },
  abweichung: { text: "Anmeldung berichtigen", klasse: "gefahr" },
};

export default async function Bauabzugsteuer({ searchParams }: { searchParams: Promise<{ monate?: string }> }) {
  const { monate = "12" } = await searchParams;
  const d = await api<Uebersicht>(`/bauabzug?monate=${monate}`);
  const ges = new Map(d.gesellschaften.map((g) => [g.id, g]));
  const hw = new Map(d.handwerker.map((h) => [h.id, h]));
  const alle = d.monate.flatMap((m) => m.zeilen.map((z) => ({ ...z, faelligAm: m.faelligAm })));
  const offen = alle.filter((z) => z.status === "offen" || z.status === "abweichung");
  const nichtAbgefuehrt = alle.filter((z) => z.status === "angemeldet");
  const naechster = d.monate.filter((m) => m.nichtAbgefuehrt).map((m) => m.faelligAm).sort()[0];
  const summe = (l: typeof alle) => l.reduce((s, z) => s + Number(z.abzugsbetrag), 0);
  const mehrereGesellschaften = d.gesellschaften.length > 1;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Bauabzugsteuer</h1>
          <p className="untertitel">Anmeldung und Abführung nach § 48a EStG – je Gesellschaft, Handwerker und Monat</p>
        </div>
        <nav className="segment">
          {["12", "24", "36"].map((m) => (
            <a key={m} href={`/bauabzug?monate=${m}`} className={monate === m ? "aktiv" : undefined}>
              {m} Monate
            </a>
          ))}
        </nav>
      </div>

      <div className="kpis">
        <div className={`kpi${offen.length ? " kpi-warnung" : ""}`}>
          <span>
            <CircleAlert size={15} /> noch anzumelden
          </span>
          <b>{deZahl(summe(offen), 2)} €</b>
          <small>{offen.length ? `${offen.length} Anmeldung(en)` : "alles angemeldet"}</small>
        </div>
        <div className="kpi">
          <span>
            <Landmark size={15} /> angemeldet, nicht abgeführt
          </span>
          <b>{deZahl(summe(nichtAbgefuehrt), 2)} €</b>
          <small>{nichtAbgefuehrt.length} Anmeldung(en)</small>
        </div>
        <div className="kpi">
          <span>
            <CalendarClock size={15} /> nächster Termin
          </span>
          <b>{naechster ? deDatum(naechster) : "–"}</b>
          <small>10. des Folgemonats (Wochenende → Montag)</small>
        </div>
      </div>

      {!d.monate.length ? (
        <div className="karte">
          <p className="leer">In diesem Zeitraum wurde keine Bauabzugsteuer einbehalten – alle bezahlten Handwerker hatten eine gültige Freistellungsbescheinigung.</p>
        </div>
      ) : null}

      {d.monate.map((m) => (
        <section key={m.monat} className="karte ohne-innenabstand bauabzugmonat">
          <div className="bauabzugkopf">
            <div>
              <h2>{m.monatText}</h2>
              <span className="hint">
                anzumelden und abzuführen bis <b>{deDatum(m.faelligAm)}</b>
              </span>
            </div>
            <div className="badges">
              {m.ueberfaellig ? <span className="badge gefahr">Termin überschritten</span> : null}
              {!m.nichtAbgefuehrt ? <span className="badge gut">erledigt</span> : null}
              <span className="badge">Abzug {deZahl(m.summe.abzugsbetrag, 2)} €</span>
            </div>
          </div>
          <div className="tabellenrahmen">
            <table>
              <thead>
                <tr>
                  <th>Handwerker (Leistender)</th>
                  {mehrereGesellschaften ? <th>Gesellschaft</th> : null}
                  <th className="num">Zahlungen</th>
                  <th className="num">Gegenleistung</th>
                  <th className="num">Abzug 15 %</th>
                  <th>Stand</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.zeilen.map((z) => {
                  const h = hw.get(z.handwerkerId);
                  const g = ges.get(z.gesellschaftId);
                  const fehlt = [!h?.steuernummer && "Steuernummer", !h?.finanzamt && "Finanzamt"].filter(Boolean);
                  const beleg = `/bauabzug/beleg?gesellschaftId=${z.gesellschaftId}&handwerkerId=${z.handwerkerId}&monat=${z.monat}`;
                  return (
                    <tr key={`${z.gesellschaftId}-${z.handwerkerId}`}>
                      <td>
                        <a href={`/partner/${z.handwerkerId}`}>{h ? partnerName(h) : "–"}</a>
                        <div className="hint">
                          {fehlt.length ? (
                            <span className="warntext">
                              <TriangleAlert size={12} /> {fehlt.join(" und ")} fehlt
                            </span>
                          ) : (
                            `St.-Nr. ${h!.steuernummer} · FA ${h!.finanzamt}`
                          )}
                        </div>
                      </td>
                      {mehrereGesellschaften ? <td>{g ? `${g.nr} ${g.name}` : "–"}</td> : null}
                      <td className="num">{z.zahlungen.length}</td>
                      <td className="num">{deZahl(z.gegenleistung, 2)}</td>
                      <td className="num fett">{deZahl(z.abzugsbetrag, 2)}</td>
                      <td>
                        <span className={`badge ${STATUS[z.status].klasse}`}>{STATUS[z.status].text}</span>
                        {z.anmeldung ? (
                          <div className="hint">
                            angemeldet {deDatum(z.anmeldung.angemeldetAm)}
                            {z.anmeldung.abgefuehrtAm ? `, abgeführt ${deDatum(z.anmeldung.abgefuehrtAm)}` : ""}
                            {z.status === "abweichung" ? ` (damals ${deZahl(z.anmeldung.abzugsbetrag, 2)} €)` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="aktionsspalte">
                        <a className="knopf zweitrangig klein" href={beleg}>
                          <FileText size={14} /> Beleg
                        </a>
                        <details className="bauabzugerfassung">
                          <summary className="knopf zweitrangig klein">{z.anmeldung ? "Ändern" : "Anmeldung erfassen"}</summary>
                          <Formular aktion={anmeldungSpeichern} knopf={z.status === "abweichung" ? "Berichtigung speichern" : "Speichern"}>
                            <input type="hidden" name="gesellschaftId" value={z.gesellschaftId} />
                            <input type="hidden" name="handwerkerId" value={z.handwerkerId} />
                            <input type="hidden" name="monat" value={z.monat} />
                            <label>
                              angemeldet am
                              <input type="date" name="angemeldetAm" defaultValue={z.status === "abweichung" ? d.stichtag : (z.anmeldung?.angemeldetAm ?? d.stichtag)} required />
                            </label>
                            <label>
                              abgeführt am
                              <input type="date" name="abgefuehrtAm" defaultValue={z.anmeldung?.abgefuehrtAm ?? ""} />
                            </label>
                          </Formular>
                          {z.anmeldung ? (
                            <Formular aktion={anmeldungZuruecknehmen.bind(null, z.anmeldung.id)} knopf="Erfassung zurücknehmen" knopfArt="zweitrangig" bestaetigen="Erfasste Anmeldung wirklich zurücknehmen?" />
                          ) : null}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="karte">
        <h2>So geht es</h2>
        <ul className="hint erklaerung">
          <li>Die Plattform behält bei jeder Zahlung an einen Handwerker ohne gültige Freistellungsbescheinigung 15 % der Gegenleistung ein (Rechnungsprüfung und Zahlungslauf).</li>
          <li>Bis zum 10. des Folgemonats je Handwerker eine Anmeldung beim <b>Finanzamt des Handwerkers</b> abgeben (ELSTER, Formular „Anmeldung über den Steuerabzug bei Bauleistungen“) und den Betrag dorthin überweisen. Die nötigen Angaben stehen auf dem Beleg.</li>
          <li>Dem Handwerker den Abrechnungsbeleg nach § 48a Abs. 2 EStG übergeben.</li>
          <li>Anmeldung und Abführung hier erfassen – dann verschwindet die Erinnerung im Cockpit. Kommen danach Zahlungen im selben Monat hinzu, wird „Anmeldung berichtigen“ angezeigt.</li>
        </ul>
      </section>
    </>
  );
}
