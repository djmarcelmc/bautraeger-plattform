import { UMLAGE_ARTEN, UMLAGE_TEXT } from "@bt/domain";
import { Feld, Gruppe } from "@/components/Felder";
import { deZahl } from "@/lib/format";
import { partnerName, type Handwerkervertrag, type Partner } from "@/lib/typen";

/** Formularfelder eines Handwerkervertrags (Anlage und Konditionen). */
export function VertragFelder({ v, gewerkId, handwerker }: { v?: Handwerkervertrag; gewerkId: string; handwerker: Partner[] }) {
  const sortiert = [...handwerker].sort((a, b) => Number(b.rollen.includes("handwerker")) - Number(a.rollen.includes("handwerker")) || a.suchcode.localeCompare(b.suchcode));
  return (
    <>
      <input type="hidden" name="gewerkId" value={v?.gewerkId ?? gewerkId} />
      <Gruppe titel="Auftrag">
        <label className="breit">
          <span>Handwerker / Lieferant *</span>
          <select name="handwerkerId" required defaultValue={v?.handwerkerId ?? ""}>
            <option value="" disabled>
              – wählen –
            </option>
            {sortiert.map((p) => (
              <option key={p.id} value={p.id}>
                {p.suchcode} – {partnerName(p)}
              </option>
            ))}
          </select>
        </label>
        <Feld label="Auftragssumme brutto €" name="vertragBrutto" wert={deZahl(v?.vertragBrutto)} zahl pflicht />
        <Feld label="Nr. intern" name="nrIntern" wert={v?.nrIntern} />
        <Feld label="Angebot vom" name="angebotVom" typ="date" wert={v?.angebotVom} />
        <Feld label="Vertrag vom" name="vertragVom" typ="date" wert={v?.vertragVom} />
      </Gruppe>
      <Gruppe titel="Zahlung">
        <Feld label="Nachlass %" name="nachlassProzent" wert={deZahl(v?.nachlassProzent)} zahl />
        <Feld label="Skonto %" name="skontoProzent" wert={deZahl(v?.skontoProzent)} zahl />
        <Feld label="Skontofrist (Tage)" name="skontoFristTage" wert={v?.skontoFristTage} zahl hinweis="ab Rechnungseingang" />
        <Feld label="Zahlungsfrist (Tage)" name="zahlungsfristTage" wert={v?.zahlungsfristTage} zahl />
      </Gruppe>
      <Gruppe titel="Umlagen (% vom Rechnungsbetrag nach Nachlass)">
        {UMLAGE_ARTEN.map((a) => (
          <Feld key={a} label={UMLAGE_TEXT[a]} name={`umlage_${a}`} wert={deZahl(v?.umlagen?.[a])} zahl />
        ))}
      </Gruppe>
      <Gruppe titel="Sicherheiten & Gewährleistung">
        <Feld label="Einbehalt Vertragserfüllung %" name="einbehaltVertragserfuellungProzent" wert={deZahl(v?.einbehaltVertragserfuellungProzent)} zahl hinweis="bei Abschlagsrechnungen" />
        <Feld label="Einbehalt Gewährleistung %" name="einbehaltGewaehrleistungProzent" wert={deZahl(v?.einbehaltGewaehrleistungProzent)} zahl hinweis="bei der Schlussrechnung" />
        <Feld label="Gewährleistung (Monate)" name="gewaehrleistungMonate" wert={v?.gewaehrleistungMonate} zahl hinweis="VOB 48, BGB 60" />
        <Feld label="Abnahme am" name="abnahmeAm" typ="date" wert={v?.abnahmeAm} />
      </Gruppe>
    </>
  );
}
