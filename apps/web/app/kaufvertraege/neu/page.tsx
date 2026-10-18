import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Feld, Gruppe, Haken } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deZahl } from "@/lib/format";
import { partnerName, type Partner, type ProjektDetail, type ProjektListe } from "@/lib/typen";
import { kaufvertragAnlegen } from "../../verkauf/aktionen";

export const dynamic = "force-dynamic";

export default async function KaufvertragNeu({ searchParams }: { searchParams: Promise<{ projekt?: string }> }) {
  const { projekt: projektId } = await searchParams;
  if (!projektId) {
    const projekte = await api<ProjektListe[]>("/projekte?abgeschlossen=nein");
    return (
      <>
        <p className="brotkrumen">
          <a href="/verkauf">Verkauf</a> ›
        </p>
        <h1>Neuer Kaufvertrag</h1>
        <p className="untertitel">Für welches Projekt?</p>
        <div className="kachelraster" style={{ marginTop: 16 }}>
          {projekte.map((p) => (
            <a key={p.id} href={`?projekt=${p.id}`} className="projektkachel">
              <span className="projektnr">{p.nr}</span>
              <div className="kacheltitel">{p.suchcode}</div>
              <div className="kachelzeile">{p.einheiten} Einheiten</div>
            </a>
          ))}
        </div>
      </>
    );
  }
  const [projekt, partner] = await Promise.all([api<ProjektDetail>(`/projekte/${projektId}`), api<Partner[]>("/partner")]);
  const frei = projekt.einheiten.filter((e) => !e.verkauft);
  const kunden = partner
    .filter((p) => p.rollen.some((r) => r === "kunde" || r === "interessent"))
    .concat(partner.filter((p) => !p.rollen.some((r) => r === "kunde" || r === "interessent")));
  const partnerOptionen = kunden.map((p) => (
    <option key={p.id} value={p.id}>
      {p.suchcode} – {partnerName(p)}
    </option>
  ));
  return (
    <>
      <p className="brotkrumen">
        <a href="/verkauf">Verkauf</a> › <a href={`/projekte/${projekt.id}`}>{projekt.nr} {projekt.suchcode}</a> ›
      </p>
      <h1>Neuer Kaufvertrag</h1>
      <p className="untertitel">Der MaBV-Ratenplan (Standard, 7 Raten) wird aus der Vertragssumme automatisch erzeugt.</p>
      {!frei.length ? (
        <div className="karte">Alle Einheiten dieses Projekts sind verkauft.</div>
      ) : (
        <Formular aktion={kaufvertragAnlegen.bind(null, projekt.id)} knopf="Kaufvertrag anlegen">
          <fieldset>
            <legend>Einheiten</legend>
            <div className="auswahlliste">
              {frei.map((e) => (
                <label key={e.id} className="auswahlzeile">
                  <input type="checkbox" name="einheit" value={e.id} />
                  <span className="auswahltext">
                    <b>{e.nr}</b> {EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT]}
                    {e.art ? ` · ${e.art}` : ""}
                    {e.wohnflaeche ? ` · ${deZahl(e.wohnflaeche)} m²` : ""}
                  </span>
                  <span className="auswahlpreis">
                    <input name={`vk_${e.id}`} defaultValue={deZahl(e.vkBrutto)} className="zahl" inputMode="decimal" aria-label={`Verkaufspreis ${e.nr}`} />
                    <span>€</span>
                  </span>
                </label>
              ))}
            </div>
            <small className="hint">Preise können für diesen Vertrag angepasst werden (Listenpreis vorbelegt).</small>
          </fieldset>
          <Gruppe titel="Käufer">
            <label>
              <span>Käufer 1 * (Rechnungsempfänger)</span>
              <select name="kaeufer1" required defaultValue="">
                <option value="" disabled>
                  – wählen –
                </option>
                {partnerOptionen}
              </select>
            </label>
            <Feld label="Anteil Käufer 1 %" name="anteil1" wert="50" zahl hinweis="nur bei zwei Käufern relevant" />
            <label>
              <span>Käufer 2</span>
              <select name="kaeufer2" defaultValue="">
                <option value="">– keiner –</option>
                {partnerOptionen}
              </select>
            </label>
            <Feld label="Anteil Käufer 2 %" name="anteil2" wert="50" zahl />
            <p className="hint breit">
              Käufer fehlt? <a href="/partner/neu" target="_blank">Geschäftspartner anlegen</a> und Seite neu laden.
            </p>
          </Gruppe>
          <Gruppe titel="Vertrag">
            <Feld label="Datum" name="datum" typ="date" />
            <Feld label="Urkundennummer" name="urkundennr" />
            <Feld label="Zahlungsziel (Tage)" name="zahlungszielTage" wert={10} zahl />
            <Haken label="Erbbaurecht (1. Rate 20 %)" name="erbbaurecht" />
          </Gruppe>
          <Gruppe titel="Fälligkeitsvoraussetzungen (§ 3 Abs. 1 MaBV)">
            <Haken label="Vertrag wirksam" name="vertragWirksam" />
            <Feld label="Auflassungsvormerkung eingetragen am" name="vormerkungEingetragenAm" typ="date" />
            <Haken label="Lastenfreistellung gesichert" name="lastenfreistellungGesichert" />
            <Haken label="Bürgschaft nach § 7 MaBV (ersetzt die Voraussetzungen)" name="buergschaftNach7" />
          </Gruppe>
        </Formular>
      )}
    </>
  );
}
