import type { ReactNode } from "react";

/** Lesbare Feldnamen für das Änderungsprotokoll. */
const FELD_TEXT: Record<string, string> = {
  nr: "Nr.", suchcode: "Suchcode", name: "Name", anschrift: "Anschrift", strasse: "Straße", plz: "PLZ", ort: "Ort",
  art: "Art", para13bAnwendbar: "§ 13b UStG", grundbuchamt: "Grundbuchamt", grundbuchBlatt: "Grundbuch-Blatt",
  flurstueck: "Flurstück", kostenstelle: "Kostenstelle", projektbeginn: "Projektbeginn", baubeginnSoll: "Baubeginn Soll",
  baubeginnIst: "Baubeginn Ist", fertigstellungSoll: "Fertigstellung Soll", fertigstellungIst: "Fertigstellung Ist",
  abgeschlossen: "Abgeschlossen", gesellschaftId: "Gesellschaft", typ: "Typ", bauabschnitt: "Bauabschnitt", etage: "Etage",
  wohnflaeche: "Wohnfläche m²", miteigentumTsd: "Miteigentum ‰", preisProM2: "Preis pro m²", vkBrutto: "VK brutto",
  mindestVk: "Mindest-VK", zugehoerigZuEinheitId: "Zugehörige Einheit", firma: "Firma", anrede: "Anrede",
  vorname: "Vorname", nachname: "Nachname", email: "E-Mail", telefon: "Telefon", iban: "IBAN", rollen: "Rollen",
  freistellungGueltigBis: "Freistellung bis", datevBeraternr: "DATEV-Beraternr.", datevMandantennr: "DATEV-Mandantennr.",
  skr: "Kontenrahmen", sachkontenlaenge: "Sachkontenlänge",
};

function wertText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join(".");
  if (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)) return "(verknüpft)";
  return String(v);
}

export function Feld({
  label,
  name,
  wert,
  typ = "text",
  pflicht,
  hinweis,
  zahl,
  breit,
}: {
  label: string;
  name: string;
  wert?: string | number | null;
  typ?: "text" | "date" | "email" | "number";
  pflicht?: boolean;
  hinweis?: string;
  zahl?: boolean;
  breit?: boolean;
}) {
  return (
    <label className={breit ? "breit" : undefined}>
      <span>
        {label}
        {pflicht ? " *" : ""}
      </span>
      <input
        name={name}
        type={typ}
        defaultValue={wert ?? ""}
        required={pflicht}
        inputMode={zahl ? "decimal" : undefined}
        className={zahl ? "zahl" : undefined}
      />
      {hinweis ? <small>{hinweis}</small> : null}
    </label>
  );
}

export function Auswahl({
  label,
  name,
  wert,
  optionen,
  pflicht,
  leer,
}: {
  label: string;
  name: string;
  wert?: string | null;
  optionen: { wert: string; text: string }[];
  pflicht?: boolean;
  leer?: string;
}) {
  return (
    <label>
      <span>
        {label}
        {pflicht ? " *" : ""}
      </span>
      <select name={name} defaultValue={wert ?? ""} required={pflicht}>
        {leer !== undefined ? <option value="">{leer}</option> : null}
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Haken({ label, name, wert, wertAttr }: { label: string; name: string; wert?: boolean; wertAttr?: string }) {
  return (
    <label className="haken">
      <input type="checkbox" name={name} value={wertAttr ?? "on"} defaultChecked={!!wert} /> {label}
    </label>
  );
}

export function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{titel}</legend>
      <div className="raster">{children}</div>
    </fieldset>
  );
}

export function Protokoll({
  eintraege,
}: {
  eintraege: { id: string; zeitpunkt: string; aktion: string; benutzer: string; alt: unknown; neu: unknown }[];
}) {
  if (!eintraege.length) return <p className="hint">Noch keine Änderungen.</p>;
  const text = { insert: "angelegt", update: "geändert", delete: "gelöscht" } as Record<string, string>;
  return (
    <table className="protokoll">
      <thead>
        <tr>
          <th>Zeitpunkt</th>
          <th>Aktion</th>
          <th>Benutzer</th>
          <th>Änderung</th>
        </tr>
      </thead>
      <tbody>
        {eintraege.map((e) => (
          <tr key={e.id}>
            <td>{new Date(e.zeitpunkt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</td>
            <td>{text[e.aktion] ?? e.aktion}</td>
            <td>{e.benutzer}</td>
            <td className="diff">
              {e.aktion === "update" && e.neu && typeof e.neu === "object"
                ? Object.entries(e.neu as Record<string, unknown>).map(([k, v]) => (
                    <div key={k}>
                      <b>{FELD_TEXT[k] ?? k}</b>: {wertText((e.alt as Record<string, unknown>)?.[k])} → {wertText(v)}
                    </div>
                  ))
                : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
