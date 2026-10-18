import type { EingangVorschlag, Rechnungsdaten } from "@bt/domain";
import { FileCheck2, FileUp, Inbox, Mail, RefreshCw, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deZahl, deZeit } from "@/lib/format";
import { abrufen, erfassen, hochladen, verwerfen, wiederherstellen } from "./aktionen";

export const dynamic = "force-dynamic";

interface Eingang {
  id: string;
  quelle: "mail" | "upload";
  absender: string | null;
  betreff: string | null;
  empfangenAm: string;
  dokumentId: string;
  dateiname: string;
  daten: Rechnungsdaten;
  status: "neu" | "erfasst" | "verworfen";
  eingangsrechnungId: string | null;
  bemerkung: string | null;
  erledigtVon: string | null;
  vorschlag: EingangVorschlag | null;
}

interface Liste {
  postfach: { adresse: string } | null;
  anzahl: { neu: number; erfasst: number; verworfen: number };
  handwerker: { id: string; name: string }[];
  vertraege: { id: string; handwerkerId: string | null; nrIntern: string | null; projektNr: number; projektSuchcode: string; gewerk: string; gesellschaft: string; abgeschlossen: boolean; offeneRechnung: boolean }[];
  eingaenge: Eingang[];
}

const STATUS = [
  ["neu", "Zu erfassen"],
  ["erfasst", "Erfasst"],
  ["verworfen", "Verworfen"],
] as const;

const QUELLE: Record<Rechnungsdaten["quelle"], { text: string; klasse: string }> = {
  "xrechnung-cii": { text: "E-Rechnung (ZUGFeRD/XRechnung)", klasse: "gut" },
  "xrechnung-ubl": { text: "E-Rechnung (XRechnung UBL)", klasse: "gut" },
  "pdf-text": { text: "aus PDF-Text erkannt – bitte prüfen", klasse: "warnung" },
  keine: { text: "nichts erkannt", klasse: "" },
};

export default async function Rechnungseingang({ searchParams }: { searchParams: Promise<{ status?: string; id?: string }> }) {
  const sp = await searchParams;
  const status = STATUS.some(([w]) => w === sp.status) ? sp.status! : "neu";
  const d = await api<Liste>(`/rechnungseingang?status=${status}`);
  const aktiv = d.eingaenge.find((e) => e.id === sp.id) ?? d.eingaenge[0];
  const hwName = new Map(d.handwerker.map((h) => [h.id, h.name]));
  const gruppen = new Map<string, Liste["vertraege"]>();
  for (const v of d.vertraege.filter((x) => !x.abgeschlossen)) {
    const k = (v.handwerkerId && hwName.get(v.handwerkerId)) || "ohne Handwerker";
    gruppen.set(k, [...(gruppen.get(k) ?? []), v]);
  }

  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Rechnungseingang</h1>
          <p className="untertitel">
            Eingegangene Rechnungen prüfen und als Eingangsrechnung erfassen
            {d.postfach ? ` · Postfach ${d.postfach.adresse} wird alle 10 Minuten abgeholt` : ""}
          </p>
        </div>
        <div className="knopfleiste">
          {d.postfach ? (
            <Formular aktion={abrufen} knopf="Postfach jetzt abrufen" knopfArt="zweitrangig" className="formular inline" />
          ) : null}
        </div>
      </div>

      <div className="zweispaltig eingang-oben">
        <section className="karte">
          <h2 className="mitsymbol">
            <FileUp size={18} /> Rechnungen hochladen
          </h2>
          <Formular aktion={hochladen} knopf="Hochladen" zuruecksetzen className="formular upload">
            <div className="uploadfeld">
              <input type="file" name="dateien" multiple accept="application/pdf,.pdf,.xml,application/xml,text/xml" required />
            </div>
            <p className="hint">PDF, ZUGFeRD/Factur-X oder XRechnung (XML), mehrere auf einmal. E-Rechnungen werden vollständig ausgelesen, bei PDFs wird der Text durchsucht.</p>
          </Formular>
        </section>
        <section className="karte">
          <h2 className="mitsymbol">
            <Mail size={18} /> Rechnungspostfach
          </h2>
          {d.postfach ? (
            <p className="hint">
              Ungelesene Mails mit Anhang in <b>{d.postfach.adresse}</b> werden automatisch übernommen und im Postfach als gelesen markiert (Kategorie „Bauträger-Plattform“).
            </p>
          ) : (
            <p className="hint">
              Noch nicht eingerichtet: Mit <code>RECHNUNGEN_POSTFACH</code> und der Microsoft-365-Anbindung (App-Berechtigung Mail.ReadWrite) holt die Plattform Rechnungen aus einem Postfach wie
              rechnungen@… automatisch ab. Bis dahin Rechnungen hier hochladen.
            </p>
          )}
        </section>
      </div>

      <form className="filterleiste">
        <div className="segment">
          {STATUS.map(([w, t]) => (
            <label key={w}>
              <input type="radio" name="status" value={w} defaultChecked={status === w} />
              <span>
                {t} ({d.anzahl[w]})
              </span>
            </label>
          ))}
        </div>
        <button type="submit" className="zweitrangig">
          Anzeigen
        </button>
      </form>

      {!d.eingaenge.length ? (
        <div className="karte">
          <p className="leer mitsymbol">
            <Inbox size={18} /> {status === "neu" ? "Keine Rechnungen zu erfassen." : "Keine Einträge."}
          </p>
        </div>
      ) : (
        <div className="eingang-raster">
          <ul className="eingangsliste">
            {d.eingaenge.map((e) => (
              <li key={e.id}>
                <a href={`/rechnungseingang?status=${status}&id=${e.id}`} className={e.id === aktiv?.id ? "aktiv" : undefined}>
                  <b>{e.daten.verkaeufer ?? (e.vorschlag?.handwerkerId ? hwName.get(e.vorschlag.handwerkerId) : null) ?? e.absender ?? e.dateiname}</b>
                  <span>
                    {e.daten.rechnungsnr ? `Nr. ${e.daten.rechnungsnr}` : e.dateiname}
                    {e.daten.betragBrutto ? ` · ${deZahl(e.daten.betragBrutto)} €` : ""}
                  </span>
                  <small>
                    {e.quelle === "mail" ? "Mail" : "Upload"} · {deZeit(e.empfangenAm)}
                    {e.vorschlag?.sicherheit === "sicher" ? " · Zuordnung sicher" : ""}
                  </small>
                </a>
              </li>
            ))}
          </ul>

          {aktiv ? (
            <div className="eingang-detail">
              <iframe className="eingang-vorschau" src={`/dokumente/${aktiv.dokumentId}#view=FitH`} title={aktiv.dateiname} />
              <section className="karte">
                <div className="eingang-kopf">
                  <h2>{aktiv.dateiname}</h2>
                  <span className={`badge ${QUELLE[aktiv.daten.quelle].klasse}`}>{QUELLE[aktiv.daten.quelle].text}</span>
                </div>
                {aktiv.betreff || aktiv.absender ? (
                  <p className="hint">
                    {aktiv.absender ? `von ${aktiv.absender}` : ""} {aktiv.betreff ? `· „${aktiv.betreff}“` : ""}
                  </p>
                ) : null}
                {aktiv.vorschlag ? (
                  <ul className="eingang-gruende">
                    {aktiv.vorschlag.gruende.map((g) => (
                      <li key={g} className={/Achtung|nicht erkannt|kein offener/.test(g) ? "warntext" : undefined}>
                        {/Achtung|nicht erkannt|kein offener/.test(g) ? <TriangleAlert size={13} /> : <FileCheck2 size={13} />} {g}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {aktiv.status === "neu" ? (
                  <>
                    <Formular aktion={erfassen.bind(null, aktiv.id)} knopf="Als Eingangsrechnung erfassen">
                      <label>
                        <span>Handwerkervertrag</span>
                        <select name="handwerkervertragId" defaultValue={aktiv.vorschlag?.handwerkervertragId ?? ""} required>
                          <option value="">– bitte wählen –</option>
                          {[...gruppen].map(([name, liste]) => (
                            <optgroup key={name} label={name}>
                              {liste.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.projektNr} {v.projektSuchcode} · {v.gewerk}
                                  {v.nrIntern ? ` · ${v.nrIntern}` : ""}
                                  {v.offeneRechnung ? " · offene Rechnung!" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <div className="raster">
                        <label>
                          <span>Rechnungsnummer</span>
                          <input name="rechnungsnr" defaultValue={aktiv.daten.rechnungsnr ?? ""} required maxLength={60} />
                        </label>
                        <label>
                          <span>Rechnungsdatum</span>
                          <input type="date" name="rechnungsdatum" defaultValue={aktiv.daten.rechnungsdatum ?? ""} required />
                        </label>
                        <label>
                          <span>Eingang am</span>
                          <input type="date" name="eingangAm" defaultValue={aktiv.empfangenAm.slice(0, 10)} required />
                        </label>
                        <label>
                          <span>Betrag brutto (kumuliert)</span>
                          <input name="betragBrutto" defaultValue={aktiv.daten.betragBrutto ? deZahl(aktiv.daten.betragBrutto) : ""} inputMode="decimal" className="zahl" required />
                        </label>
                      </div>
                      <label className="haken">
                        <input type="checkbox" name="schlussrechnung" defaultChecked={aktiv.daten.schlussrechnung} />
                        <span>Schlussrechnung</span>
                      </label>
                      {aktiv.daten.iban || aktiv.daten.steuernummer || aktiv.daten.referenz ? (
                        <p className="hint">
                          Erkannt: {[aktiv.daten.iban && `IBAN ${aktiv.daten.iban}`, aktiv.daten.steuernummer && `St.-Nr. ${aktiv.daten.steuernummer}`, aktiv.daten.ustId && `USt-IdNr. ${aktiv.daten.ustId}`, aktiv.daten.referenz && `Bezug „${aktiv.daten.referenz}“`].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </Formular>
                    <details className="bankerfassung">
                      <summary className="knopf zweitrangig klein">Verwerfen</summary>
                      <Formular aktion={verwerfen.bind(null, aktiv.id)} knopf="Verwerfen" knopfArt="gefahr">
                        <label>
                          <span>Grund</span>
                          <input name="bemerkung" required maxLength={300} placeholder="z. B. Duplikat, Werbung, Mahnung zu bereits erfasster Rechnung" />
                        </label>
                      </Formular>
                    </details>
                  </>
                ) : aktiv.status === "erfasst" ? (
                  <p>
                    Erfasst von {aktiv.erledigtVon}. <a href={`/eingangsrechnungen/${aktiv.eingangsrechnungId}`}>Zur Eingangsrechnung</a>
                  </p>
                ) : (
                  <div className="knopfleiste">
                    <span className="hint">Verworfen: {aktiv.bemerkung}</span>
                    <Formular aktion={wiederherstellen.bind(null, aktiv.id)} knopf="Wiederherstellen" knopfArt="zweitrangig" className="formular inline" />
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}
      <p className="hint mitsymbol">
        <RefreshCw size={13} /> Nach dem Erfassen geht es direkt zur Rechnungsprüfung (sachlich/rechnerisch → Freigabe → Zahlung); die Datei hängt dann an der Eingangsrechnung.
      </p>
    </>
  );
}
