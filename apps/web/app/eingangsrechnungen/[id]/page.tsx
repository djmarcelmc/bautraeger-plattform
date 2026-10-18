import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Dokumente } from "@/components/Dokumente";
import { Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { Pruefkette } from "@/components/Pruefkette";
import { RechnungSchritte, RechnungStatus } from "@/components/RechnungStatus";
import { api } from "@/lib/api";
import { deDatum, deZahl, deZeit } from "@/lib/format";
import { partnerName, type RechnungDetail } from "@/lib/typen";
import { rechnungBezahlen, rechnungFreigeben, rechnungPruefen } from "../../kosten/aktionen";

export const dynamic = "force-dynamic";

export default async function RechnungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zahlungsdatum?: string }> }) {
  const { id } = await params;
  const { zahlungsdatum } = await searchParams;
  const r = await api<RechnungDetail>(`/eingangsrechnungen/${id}${zahlungsdatum ? `?zahlungsdatum=${zahlungsdatum}` : ""}`);
  const v = r.vorschau;
  const hw = r.vertrag.handwerker;
  const pfad = `/eingangsrechnungen/${id}`;
  const geprueft = r.status !== "erfasst";

  return (
    <>
      <p className="brotkrumen">
        <a href="/kosten">Kosten</a> › <a href={`/projekte/${r.vertrag.projekt.id}?reiter=kosten`}>{r.vertrag.projekt.nr} {r.vertrag.projekt.suchcode}</a> ›{" "}
        <a href={`/handwerkervertraege/${r.vertrag.id}`}>
          {r.vertrag.gewerk.nr} {r.vertrag.gewerk.bezeichnung}
        </a>{" "}
        ›
      </p>
      <div className="seitenkopf">
        <div>
          <h1>
            Rechnung {r.rechnungsnr} {r.schlussrechnung ? <span className="badge">Schlussrechnung</span> : null}
          </h1>
          <div className="metazeile">
            <span>{hw ? partnerName(hw) || hw.suchcode : "–"}</span>
            <span>vom {deDatum(r.rechnungsdatum)}</span>
            <span>Eingang {deDatum(r.eingangAm)}</span>
            {r.faelligAm ? <span>fällig {deDatum(r.faelligAm)}</span> : null}
          </div>
        </div>
        <RechnungStatus status={r.status} />
      </div>
      <RechnungSchritte status={r.status} />

      <div className="zweispaltig rechnung">
        <section className="karte ohne-innenabstand">
          <Pruefkette
            spalten={
              r.zahlung
                ? [{ titel: `Abgerechnet am ${deDatum(r.zahlung.datum)}`, werte: r.pruefergebnis ?? v.ohneSkonto, hervorheben: true }]
                : [
                    { titel: "ohne Skonto", werte: v.ohneSkonto, hervorheben: !v.skontoMoeglich },
                    { titel: `mit ${deZahl(r.vertrag.skontoProzent ?? 0)} % Skonto`, werte: v.mitSkonto, hervorheben: v.skontoMoeglich },
                  ]
            }
          />
          <div className="kettenfuss">
            <span>Rechnungsbetrag (kum.): {deZahl(r.betragBrutto)} €</span>
            <span>Nachlass {deZahl(v.nachlassProzent)} % · Umlagen {deZahl(v.umlagenProzent)} % · Einbehalt {deZahl(v.einbehaltProzent)} %</span>
          </div>
        </section>

        <section className="aktionsspalte">
          <div className="karte hinweise">
            <div className={v.freistellungGueltig ? "ok" : "fehlt"}>
              {v.freistellungGueltig ? <BadgeCheck size={16} /> : <AlertTriangle size={16} />}
              {v.freistellungGueltig ? "Freistellungsbescheinigung gültig – keine Bauabzugsteuer" : "Keine gültige Freistellung – 15 % Bauabzugsteuer werden einbehalten"}
            </div>
            <div className={v.skontoMoeglich ? "ok" : "neutral"}>
              {v.skontoFristBis
                ? v.skontoMoeglich
                  ? `Skonto möglich bei Zahlung bis ${deDatum(v.skontoFristBis)}`
                  : `Skontofrist abgelaufen am ${deDatum(v.skontoFristBis)}`
                : "Kein Skonto vereinbart"}
            </div>
            {r.maengel.offen ? (
              <div className="fehlt">
                <AlertTriangle size={16} />
                {r.maengel.offen} offene Mängel bei diesem Handwerker
                {Number(r.maengel.einbehalt) ? ` – Einbehalt ${deZahl(r.maengel.einbehalt)} € beim geprüften Betrag berücksichtigen` : ""}
              </div>
            ) : null}
            {r.geprueftVon ? (
              <div className="neutral">
                Geprüft von {r.geprueftVon}, {deZeit(r.geprueftAm!)}
                {r.bemerkung ? ` – „${r.bemerkung}“` : ""}
              </div>
            ) : null}
            {r.freigegebenVon ? (
              <div className="neutral">
                Freigegeben von {r.freigegebenVon}, {deZeit(r.freigegebenAm!)}
              </div>
            ) : null}
          </div>

          {(r.status === "erfasst" || r.status === "rechnerisch_geprueft" || r.status === "sachlich_geprueft") && (
            <div className="karte">
              <h2>{geprueft ? "Prüfung ändern" : "1. Rechnung prüfen"}</h2>
              <Formular aktion={rechnungPruefen.bind(null, id)} knopf="Prüfung speichern" knopfArt={geprueft ? "zweitrangig" : undefined} className="formular">
                <Feld label="Geprüfter Betrag brutto € (kumuliert)" name="geprueftKumuliert" wert={deZahl(r.geprueftKumuliert ?? r.betragBrutto)} zahl pflicht />
                <Feld label="Bemerkung zur Prüfung" name="bemerkung" wert={r.bemerkung} />
              </Formular>
            </div>
          )}
          {geprueft && r.status !== "freigegeben" && r.status !== "bezahlt" && (
            <div className="karte">
              <h2>2. Zur Zahlung freigeben</h2>
              <p className="hint">Auszahlung voraussichtlich {deZahl(v.skontoMoeglich ? v.mitSkonto.auszahlung : v.ohneSkonto.auszahlung)} €.</p>
              <Formular aktion={rechnungFreigeben.bind(null, id)} knopf="Freigeben" className="formular" />
            </div>
          )}
          {r.status === "freigegeben" && (
            <div className="karte">
              <h2>3. Zahlung buchen</h2>
              <form className="filterleiste" action={pfad}>
                <label>
                  <span>Zahlungsdatum für Vorschau</span>
                  <input type="date" name="zahlungsdatum" defaultValue={v.zahlungsdatum} />
                </label>
                <button type="submit" className="zweitrangig">
                  Neu berechnen
                </button>
              </form>
              <Formular aktion={rechnungBezahlen.bind(null, id)} knopf={`${deZahl(v.skontoMoeglich ? v.mitSkonto.auszahlung : v.ohneSkonto.auszahlung)} € als bezahlt buchen`} className="formular">
                <input type="hidden" name="datum" value={v.zahlungsdatum} />
                <p className="hint">
                  Zahlung am {deDatum(v.zahlungsdatum)} {v.skontoMoeglich ? "mit" : "ohne"} Skonto
                  {Number(v.ohneSkonto.bauabzugsteuer) ? `, Bauabzugsteuer ${deZahl(v.skontoMoeglich ? v.mitSkonto.bauabzugsteuer : v.ohneSkonto.bauabzugsteuer)} € ans Finanzamt abführen` : ""}.
                </p>
              </Formular>
            </div>
          )}
          {r.zahlung && (
            <div className="karte">
              <h2>Bezahlt</h2>
              <p>
                {deZahl(r.zahlung.betrag)} € am {deDatum(r.zahlung.datum)}
                {Number(r.zahlung.skonto) ? ` · Skonto ${deZahl(r.zahlung.skonto)} €` : ""}
                {Number(r.zahlung.bauabzugsteuer) ? ` · Bauabzugsteuer ${deZahl(r.zahlung.bauabzugsteuer)} €` : ""}
              </p>
            </div>
          )}
        </section>
      </div>
      <h2>Rechnungsbeleg</h2>
      <Dokumente objektTyp="eingangsrechnung" objektId={id} pfad={pfad} />
    </>
  );
}
