import { Mail, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { schreibenVersenden } from "@/app/schreiben/aktionen";

interface Vorlage {
  an: string[];
  ohneEmail: string[];
  betreff: string;
  text: string;
  dateiname: string;
  kaufvertrag: { id: string; nr: string };
  versandweg: { art: string; beschreibung: string };
  vermerke: { id: string; an: string[]; status: string; fehler: string | null; gesendetAm: string | null; angelegtAm: string }[];
}

const STATUS: Record<string, { text: string; klasse: string }> = {
  wartend: { text: "wird gesendet", klasse: "info" },
  gesendet: { text: "gesendet", klasse: "gut" },
  protokolliert: { text: "nur protokolliert", klasse: "warnung" },
  fehler: { text: "Fehler", klasse: "gefahr" },
};
const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

/** Bildschirm-Karte unter einer Druckansicht: Schreiben als PDF per E-Mail an die Käufer. */
export async function PerMailSenden({ art, id, pfad }: { art: "zahlungsanforderung" | "mahnung" | "sonderwunsch"; id: string; pfad: string }) {
  const v = await api<Vorlage>(`/schreiben/${art}/${id}`);
  return (
    <section className="karte nur-bildschirm mailversand">
      <h2>
        <Mail size={18} /> Per E-Mail senden
      </h2>
      {v.vermerke.length ? (
        <ul className="vermerke">
          {v.vermerke.map((m) => (
            <li key={m.id}>
              <span className={`badge ${STATUS[m.status]?.klasse ?? ""}`}>{STATUS[m.status]?.text ?? m.status}</span> {zeit(m.gesendetAm ?? m.angelegtAm)} an {m.an.join(", ")}
              {m.fehler ? <span className="hint"> – {m.fehler}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {v.versandweg.art === "protokoll" ? (
        <p className="hinweisbox">
          <TriangleAlert size={16} /> Es ist noch kein E-Mail-Versand eingerichtet – die Nachricht wird nur im Postausgang protokolliert (Einstellungen › Benachrichtigungen).
        </p>
      ) : (
        <p className="hint">Versand über {v.versandweg.beschreibung}. Das PDF „{v.dateiname}“ wird zusätzlich am Kaufvertrag {v.kaufvertrag.nr} unter „Schriftverkehr“ abgelegt.</p>
      )}
      {v.ohneEmail.length ? <p className="warntext">Ohne E-Mail-Adresse: {v.ohneEmail.join(", ")} – bitte per Post senden oder Adresse beim Geschäftspartner ergänzen.</p> : null}
      <Formular aktion={schreibenVersenden.bind(null, art, id, pfad)} knopf="Als PDF senden" bestaetigen="Schreiben jetzt als PDF per E-Mail senden?">
        <div className="raster">
          <label className="breit">
            <span>An *</span>
            <input name="an" defaultValue={v.an.join(", ")} required placeholder="name@beispiel.de, …" />
          </label>
          <label className="breit">
            <span>Betreff *</span>
            <input name="betreff" defaultValue={v.betreff} required />
          </label>
          <label className="breit">
            <span>Text *</span>
            <textarea name="text" rows={9} defaultValue={v.text} required />
          </label>
        </div>
      </Formular>
    </section>
  );
}
