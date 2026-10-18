import { Mail } from "lucide-react";
import { Feld, Haken } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { EinstellungenReiter } from "../Reiter";
import { aufgabenJetzt, empfaengerSpeichern, erneutSenden, testmailSenden } from "./aktionen";

export const dynamic = "force-dynamic";

interface Uebersicht {
  versand: { art: "protokoll" | "smtp" | "microsoft365"; beschreibung: string };
  einstellungen: { maengelAn: string[]; aufgabenAn: string[]; kaeuferInformieren: boolean };
  statistik: { wartend?: number; fehler?: number };
  postausgang: { id: string; an: string[]; betreff: string; anlass: string; status: string; versuche: number; fehler: string | null; gesendetAm: string | null; angelegtAm: string; naechsterVersuchAm: string }[];
}

const ANLASS: Record<string, string> = {
  mangel_gemeldet: "Mängelanzeige (Bauleitung)",
  mangel_eingang: "Eingangsbestätigung (Käufer)",
  mangel_status: "Statuswechsel (Käufer)",
  aufgaben: "Aufgabenübersicht",
  test: "Test",
};
const STATUS: Record<string, [string, string]> = { gesendet: ["gesendet", "gut"], protokolliert: ["nur protokolliert", ""], wartend: ["wartet", "warnung"], fehler: ["fehlgeschlagen", "gefahr"] };
const zeit = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default async function Benachrichtigungen() {
  const d = await api<Uebersicht>("/benachrichtigungen");
  const e = d.einstellungen;
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>Einstellungen</h1>
          <p className="untertitel">Werte, die für alle Gesellschaften gelten</p>
        </div>
      </div>
      <EinstellungenReiter aktiv="benachrichtigungen" />

      <div className={`hinweisbox${d.versand.art === "protokoll" ? "" : " erfolg"}`}>
        <Mail size={16} />
        <div>
          <b>Versandweg:</b> {d.versand.beschreibung}.
          {d.versand.art === "protokoll" ? (
            <>
              {" "}
              Nachrichten werden im Postausgang festgehalten, aber nicht verschickt. Für den Versand über Outlook die Microsoft-365-Variablen (<code>MAIL_GRAPH_*</code>,{" "}
              <code>MAIL_ABSENDER</code>) setzen, alternativ <code>MAIL_SMTP_URL</code> – siehe docs/deployment.md.
            </>
          ) : null}
          {d.statistik.fehler ? ` · ${d.statistik.fehler} fehlgeschlagen` : ""}
          {d.statistik.wartend ? ` · ${d.statistik.wartend} wartend` : ""}
        </div>
      </div>

      <div className="zweispaltig">
        <section className="karte">
          <h2>Empfänger</h2>
          <Formular aktion={empfaengerSpeichern}>
            <Feld label="Neue Mängelanzeigen aus dem Käuferportal an" name="maengelAn" wert={e.maengelAn.join(", ")} breit hinweis="z. B. bauleitung@…; mehrere durch Komma trennen" />
            <Feld label="Tägliche Aufgabenübersicht (7 Uhr) an" name="aufgabenAn" wert={e.aufgabenAn.join(", ")} breit hinweis="dringende und anstehende Aufgaben aus dem Cockpit" />
            <Haken label="Käufer per E-Mail informieren (Eingangsbestätigung, in Bearbeitung, erledigt)" name="kaeuferInformieren" wert={e.kaeuferInformieren} />
          </Formular>
        </section>
        <section className="karte">
          <h2>Testen</h2>
          <Formular aktion={testmailSenden} knopf="Testnachricht senden">
            <Feld label="An" name="an" typ="email" pflicht />
          </Formular>
          <hr />
          <p className="hint">Die Aufgabenübersicht geht jeden Morgen ab 7 Uhr an die eingetragenen Empfänger – hier lässt sie sich sofort auslösen.</p>
          <Formular aktion={aufgabenJetzt} knopf="Aufgabenübersicht jetzt senden" knopfArt="zweitrangig" />
        </section>
      </div>

      <h2>Postausgang</h2>
      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>erstellt</th>
              <th>Anlass</th>
              <th>Empfänger / Betreff</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.postausgang.map((n) => {
              const [t, k] = STATUS[n.status] ?? [n.status, ""];
              return (
                <tr key={n.id}>
                  <td className="hint">{zeit(n.angelegtAm)}</td>
                  <td>{ANLASS[n.anlass] ?? n.anlass}</td>
                  <td>
                    {n.betreff}
                    <div className="hint">{n.an.join(", ")}</div>
                  </td>
                  <td>
                    <span className={`badge ${k}`}>{t}</span>
                    {n.gesendetAm ? <div className="hint">{zeit(n.gesendetAm)}</div> : null}
                    {n.fehler ? (
                      <div className="hint minus">
                        {n.fehler}
                        {n.status === "wartend" ? ` · nächster Versuch ${zeit(n.naechsterVersuchAm)}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {n.status === "fehler" || (n.status === "wartend" && n.versuche > 0) ? (
                      <Formular aktion={erneutSenden.bind(null, n.id)} knopf="Erneut senden" knopfArt="zweitrangig" className="formular eng" />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!d.postausgang.length && <p className="leer">Noch keine Nachrichten.</p>}
      </div>
    </>
  );
}
