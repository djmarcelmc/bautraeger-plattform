import { Mail, Printer, TriangleAlert } from "lucide-react";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import { sammelVersenden } from "../aktionen";

export const dynamic = "force-dynamic";

type Art = "zahlungsanforderung" | "mahnung";
interface Sammel {
  versandweg: { art: string; beschreibung: string };
  schreiben: {
    id: string;
    nummer: string;
    titel: string | null;
    betrag: string;
    kaufvertrag: { id: string; nr: string };
    kaeufer: string;
    an: string[];
    vermerke: { status: string; angelegtAm: string; gesendetAm: string | null }[];
  }[];
}

const STATUS: Record<string, { text: string; klasse: string }> = {
  wartend: { text: "wird gesendet", klasse: "info" },
  gesendet: { text: "gesendet", klasse: "gut" },
  protokolliert: { text: "nur protokolliert", klasse: "warnung" },
  fehler: { text: "Fehler", klasse: "gefahr" },
};
const TITEL: Record<Art, string> = { zahlungsanforderung: "Zahlungsanforderungen versenden", mahnung: "Mahnungen versenden" };

/** Übersicht nach Mahnlauf oder Sammelanforderung: per E-Mail senden, Rest drucken. */
export default async function Sammelversand({ searchParams }: { searchParams: Promise<{ art?: string; ids?: string }> }) {
  const q = await searchParams;
  const art: Art = q.art === "mahnung" ? "mahnung" : "zahlungsanforderung";
  const ids = (q.ids ?? "").split(",").filter(Boolean);
  const d = await api<Sammel>(`/schreiben/${art}?ids=${ids.join(",")}`);
  const mitMail = d.schreiben.filter((s) => s.an.length);
  const ohneMail = d.schreiben.filter((s) => !s.an.length);
  const offen = mitMail.filter((s) => !s.vermerke.some((v) => v.status !== "fehler"));
  const druck = (id: string) => (art === "mahnung" ? `/mahnungen/druck?ids=${id}` : `/zahlungsanforderungen/${id}`);
  return (
    <>
      <p className="brotkrumen">
        <a href={art === "mahnung" ? "/verkauf?reiter=mahnwesen" : "/verkauf"}>Verkauf</a> ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>{TITEL[art]}</h1>
          <p className="untertitel">
            {d.schreiben.length} Schreiben · {mitMail.length} per E-Mail · {ohneMail.length} per Post
          </p>
        </div>
        {art === "mahnung" ? (
          <a className="knopf zweitrangig" href={`/mahnungen/druck?ids=${ids.join(",")}`}>
            <Printer size={16} /> Alle drucken
          </a>
        ) : null}
      </div>

      <div className="karte ohne-innenabstand">
        <table>
          <thead>
            <tr>
              <th>Rechnung</th>
              <th>Kaufvertrag</th>
              <th>Käufer</th>
              <th className="num">Betrag €</th>
              <th>Versand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.schreiben.map((s) => {
              const letzter = s.vermerke[0];
              return (
                <tr key={s.id}>
                  <td>
                    {s.nummer}
                    {s.titel ? <div className="hint">{s.titel}</div> : null}
                  </td>
                  <td>
                    <a href={`/kaufvertraege/${s.kaufvertrag.id}`}>{s.kaufvertrag.nr}</a>
                  </td>
                  <td>
                    {s.kaeufer}
                    <div className="hint">{s.an.length ? s.an.join(", ") : <span className="warntext">keine E-Mail-Adresse – per Post</span>}</div>
                  </td>
                  <td className="num">{deZahl(s.betrag)}</td>
                  <td>{letzter ? <span className={`badge ${STATUS[letzter.status]?.klasse ?? ""}`}>{STATUS[letzter.status]?.text ?? letzter.status}</span> : <span className="hint">noch nicht versendet</span>}</td>
                  <td className="aktionsspalte">
                    <a className="knopf zweitrangig klein" href={druck(s.id)}>
                      <Printer size={14} /> {s.an.length ? "Ansehen" : "Drucken"}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="zweispaltig">
        <section className="karte">
          <h2 className="mitsymbol">
            <Mail size={18} /> Per E-Mail
          </h2>
          {d.versandweg.art === "protokoll" ? (
            <p className="hinweisbox">
              <TriangleAlert size={16} /> Es ist noch kein E-Mail-Versand eingerichtet – die Nachrichten werden nur im Postausgang protokolliert.
            </p>
          ) : (
            <p className="hint">Versand über {d.versandweg.beschreibung} mit dem Standardtext; jedes PDF wird am Kaufvertrag unter „Schriftverkehr“ abgelegt.</p>
          )}
          <Formular aktion={sammelVersenden.bind(null, art, ids)} knopf={offen.length ? `${offen.length} Schreiben per E-Mail senden` : "Erneut senden"} bestaetigen="Schreiben jetzt als PDF per E-Mail senden?">
            {offen.length < mitMail.length ? (
              <label className="haken">
                <input type="checkbox" name="erneut" /> bereits versendete erneut senden
              </label>
            ) : null}
          </Formular>
        </section>
        <section className="karte">
          <h2 className="mitsymbol">
            <Printer size={18} /> Per Post
          </h2>
          {ohneMail.length ? (
            <>
              <p className="hint">Für {ohneMail.length === 1 ? "diesen Käufer" : `diese ${ohneMail.length} Käufer`} ist keine E-Mail-Adresse hinterlegt.</p>
              {art === "mahnung" ? (
                <a className="knopf" href={`/mahnungen/druck?ids=${ohneMail.map((s) => s.id).join(",")}`}>
                  <Printer size={16} /> {ohneMail.length} Schreiben drucken
                </a>
              ) : (
                <ul className="vermerke">
                  {ohneMail.map((s) => (
                    <li key={s.id}>
                      <a href={druck(s.id)}>{s.nummer}</a> – {s.kaeufer}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="hint">Alle Käufer haben eine E-Mail-Adresse – nichts zu drucken.</p>
          )}
        </section>
      </div>
    </>
  );
}
