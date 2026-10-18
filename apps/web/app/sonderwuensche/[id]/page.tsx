import { briefAnrede, EINHEIT_TYP_TEXT, MABV_ABSCHNITTE, SONDERWUNSCH_ART_TEXT, SONDERWUNSCH_STATUS_TEXT } from "@bt/domain";
import { Printer } from "lucide-react";
import { DruckKnopf } from "@/components/DruckKnopf";
import { PerMailSenden } from "@/components/PerMailSenden";
import { Auswahl, Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import { partnerName, type Partner, type Sonderwunsch } from "@/lib/typen";
import { sonderwunschAendern } from "../aktionen";

export const dynamic = "force-dynamic";

interface Detail extends Sonderwunsch {
  abgelaufen: boolean;
  rate: { nr: number; status: string; rechnungsnr: string | null } | null;
  vertrag: { id: string; nr: string; urkundennr: string | null; datum: string | null; einheiten: { nr: string; typ: string; art: string | null }[] };
  projekt: { nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { name: string; anschrift: string | null };
  kaeufer: Partner[];
  empfaenger: Partner | null;
}

/** Angebot über einen Sonderwunsch mit Auftragserteilung zum Unterschreiben. */
export default async function SonderwunschSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await api<Detail>(`/sonderwuensche/${id}`);
  const gutschrift = s.art === "gutschrift";
  const e = s.empfaenger;
  const abschnitt = s.abschnitt ? MABV_ABSCHNITTE.find((a) => a.key === s.abschnitt)?.bezeichnung : null;
  const objekt = [s.projekt.strasse, [s.projekt.plz, s.projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const titel = gutschrift ? "Gutschrift für entfallende Leistung" : "Angebot über eine Sonderleistung";
  return (
    <>
      <div className="nur-bildschirm seitenkopf">
        <div>
          <p className="brotkrumen">
            <a href={`/kaufvertraege/${s.vertrag.id}?reiter=sonderwuensche`}>Kaufvertrag {s.vertrag.nr}</a> ›
          </p>
          <h1>
            {gutschrift ? "Gutschrift" : "Sonderwunsch"} Nr. {s.nr}
          </h1>
          <div className="metazeile">
            <span className="badge">{SONDERWUNSCH_STATUS_TEXT[s.status]}</span>
            {s.abgelaufen ? <span className="badge warnung">Angebot abgelaufen</span> : null}
            {s.rate ? (
              <span>
                Rate {s.rate.nr}
                {s.rate.rechnungsnr ? `, angefordert mit ${s.rate.rechnungsnr}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <DruckKnopf>
          <Printer size={16} /> Drucken / PDF
        </DruckKnopf>
      </div>

      <article className="schreiben">
        <header>
          <div className="absender">
            {s.gesellschaft.name}
            {s.gesellschaft.anschrift ? ` · ${s.gesellschaft.anschrift}` : ""}
          </div>
          <div className="empfaenger">
            {s.kaeufer.map((k) => (
              <div key={k.id}>{[k.anrede, partnerName(k)].filter(Boolean).join(" ")}</div>
            ))}
            {e?.strasse ? <div>{e.strasse}</div> : null}
            {e?.plz || e?.ort ? <div>{[e?.plz, e?.ort].filter(Boolean).join(" ")}</div> : null}
          </div>
          <dl className="infoblock">
            <dt>Datum</dt>
            <dd>{deDatum(s.angebotAm)}</dd>
            <dt>Kaufvertrag</dt>
            <dd>{s.vertrag.nr}</dd>
            {s.vertrag.urkundennr ? (
              <>
                <dt>UR-Nr.</dt>
                <dd>{s.vertrag.urkundennr}</dd>
              </>
            ) : null}
            <dt>{gutschrift ? "Gutschrift" : "Angebot"} Nr.</dt>
            <dd>{s.nr}</dd>
          </dl>
        </header>
        <h2>{titel}</h2>
        <p className="betreff">
          Bauvorhaben {s.projekt.suchcode}
          {objekt ? `, ${objekt}` : ""} – {s.vertrag.einheiten.map((x) => `${EINHEIT_TYP_TEXT[x.typ as keyof typeof EINHEIT_TYP_TEXT] ?? x.typ} ${x.nr}`).join(", ")}
        </p>
        <p>{briefAnrede(e)},</p>
        <p>
          {gutschrift
            ? "auf Ihren Wunsch entfällt die folgende im Kaufvertrag vereinbarte Leistung. Wir schreiben Ihnen dafür gut:"
            : "gerne bieten wir Ihnen die gewünschte Sonderleistung zu Ihrem Kaufvertrag an:"}
        </p>
        <table className="druckliste">
          <thead>
            <tr>
              <th>Leistung</th>
              <th className="num">{gutschrift ? "Gutschrift" : "Preis"} (brutto)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>{s.bezeichnung}</b>
                {s.beschreibung ? <div style={{ whiteSpace: "pre-line" }}>{s.beschreibung}</div> : null}
              </td>
              <td className="num">{deZahl(s.betragBrutto)} €</td>
            </tr>
          </tbody>
        </table>
        <p>
          {gutschrift
            ? "Der Betrag wird mit der nächsten Zahlungsanforderung verrechnet."
            : abschnitt
              ? `Der Preis wird zusammen mit der Rate „${abschnitt}“ angefordert.`
              : "Der Preis wird nach Ihrer Beauftragung angefordert und ist innerhalb der im Kaufvertrag vereinbarten Frist zu zahlen."}{" "}
          Im Übrigen gelten die Bestimmungen des Kaufvertrags unverändert.
          {s.gueltigBis ? ` An dieses Angebot halten wir uns bis zum ${deDatum(s.gueltigBis)} gebunden.` : ""}
        </p>
        <p>Mit freundlichen Grüßen</p>
        <p>{s.gesellschaft.name}</p>

        <h3 className="annahme">{gutschrift ? "Einverständnis" : "Auftragserteilung"}</h3>
        <p>
          {gutschrift
            ? `Ich/Wir sind mit dem Entfall der Leistung „${s.bezeichnung}“ und der Gutschrift von ${deZahl(s.betragBrutto)} € einverstanden.`
            : `Ich/Wir beauftragen die Sonderleistung „${s.bezeichnung}“ zum Preis von ${deZahl(s.betragBrutto)} € (brutto).`}
        </p>
        <div className="unterschriften">
          <div>Ort, Datum</div>
          {s.kaeufer.map((k) => (
            <div key={k.id}>{partnerName(k)}</div>
          ))}
        </div>
      </article>

      <PerMailSenden art="sonderwunsch" id={s.id} pfad={`/sonderwuensche/${s.id}`} />

      {s.status === "angebot" ? (
        <section className="karte nur-bildschirm">
          <h2>Angebot ändern</h2>
          <Formular aktion={sonderwunschAendern.bind(null, s.id, `/sonderwuensche/${s.id}`)}>
            <div className="raster">
              <Auswahl label="Art" name="art" wert={s.art} optionen={Object.entries(SONDERWUNSCH_ART_TEXT).map(([wert, text]) => ({ wert, text }))} />
              <Feld label="Leistung" name="bezeichnung" wert={s.bezeichnung} pflicht breit />
              <label className="breit">
                <span>Beschreibung</span>
                <textarea name="beschreibung" rows={3} defaultValue={s.beschreibung ?? ""} />
              </label>
              <Feld label="Preis für den Käufer (brutto) €" name="betragBrutto" wert={deZahl(s.betragBrutto)} zahl pflicht />
              <Feld label="Kosten Handwerker (brutto) €" name="kostenBrutto" wert={s.kostenBrutto ? deZahl(s.kostenBrutto) : ""} zahl />
              <input type="hidden" name="gewerkId" value={s.gewerkId ?? ""} />
              <Auswahl label="Abrechnung" name="abschnitt" wert={s.abschnitt} leer="sofort nach Beauftragung" optionen={MABV_ABSCHNITTE.map((a) => ({ wert: a.key, text: `mit Abschnitt: ${a.bezeichnung}` }))} />
              <Feld label="Angebot vom" name="angebotAm" typ="date" wert={s.angebotAm} />
              <Feld label="gültig bis" name="gueltigBis" typ="date" wert={s.gueltigBis} />
            </div>
          </Formular>
        </section>
      ) : null}
    </>
  );
}
