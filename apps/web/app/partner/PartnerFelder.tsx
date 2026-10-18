import { Feld, Gruppe, Haken } from "@/components/Felder";
import type { Partner } from "@/lib/typen";

export const ROLLEN_TEXT: Record<string, string> = {
  kunde: "Kunde",
  interessent: "Interessent",
  handwerker: "Handwerker",
  lieferant: "Lieferant",
  notar: "Notar",
  makler: "Makler",
  bank: "Bank",
  sonstige: "Sonstige",
};

export function PartnerFelder({ p, vorschlagNr }: { p?: Partner; vorschlagNr?: number }) {
  return (
    <>
      <Gruppe titel="Allgemein">
        <Feld label="Nr." name="nr" wert={p?.nr ?? vorschlagNr} pflicht zahl />
        <Feld label="Suchcode" name="suchcode" wert={p?.suchcode} pflicht />
        <Feld label="Firma" name="firma" wert={p?.firma} breit />
        <Feld label="Anrede" name="anrede" wert={p?.anrede} />
        <Feld label="Vorname" name="vorname" wert={p?.vorname} />
        <Feld label="Nachname" name="nachname" wert={p?.nachname} />
      </Gruppe>
      <Gruppe titel="Rollen">
        <div className="haken-reihe breit">
          {Object.entries(ROLLEN_TEXT).map(([k, t]) => (
            <Haken key={k} label={t} name="rollen" wertAttr={k} wert={p?.rollen.includes(k)} />
          ))}
        </div>
      </Gruppe>
      <Gruppe titel="Kontakt">
        <Feld label="Straße" name="strasse" wert={p?.strasse} breit />
        <Feld label="PLZ" name="plz" wert={p?.plz} />
        <Feld label="Ort" name="ort" wert={p?.ort} />
        <Feld label="E-Mail" name="email" typ="email" wert={p?.email} />
        <Feld label="Telefon" name="telefon" wert={p?.telefon} />
      </Gruppe>
      <Gruppe titel="Zahlungsverkehr & Steuern">
        <Feld label="IBAN" name="iban" wert={p?.iban?.replace(/(.{4})/g, "$1 ").trim()} breit />
        <Feld label="BIC" name="bic" wert={p?.bic} hinweis="optional, im SEPA-Raum nicht erforderlich" />
        <Feld
          label="Freistellungsbescheinigung gültig bis"
          name="freistellungGueltigBis"
          typ="date"
          wert={p?.freistellungGueltigBis}
          hinweis="§ 48b EStG – ohne gültige Bescheinigung werden 15 % Bauabzugsteuer einbehalten"
        />
        <Feld label="Steuernummer" name="steuernummer" wert={p?.steuernummer} hinweis="für die Bauabzugsteuer-Anmeldung" />
        <Feld label="Zuständiges Finanzamt" name="finanzamt" wert={p?.finanzamt} hinweis="dort wird die Bauabzugsteuer angemeldet" />
      </Gruppe>
    </>
  );
}
