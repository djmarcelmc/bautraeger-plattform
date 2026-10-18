import { ZAEHLER, ZAEHLER_TEXT } from "@bt/domain";
import { Feld } from "@/components/Felder";
import type { AbnahmeDetail } from "@/lib/typen";

/** Gemeinsame Felder einer Abnahme (ohne Art und Vertrag). */
export function AbnahmeFelder({ a }: { a?: AbnahmeDetail }) {
  return (
    <>
      <div className="raster">
        <Feld label="Datum" name="datum" typ="date" wert={a?.datum ?? new Date().toISOString().slice(0, 10)} pflicht />
        <Feld label="Ort / Treffpunkt" name="ort" wert={a?.ort} />
      </div>
      <label className="breit">
        <span>Teilnehmer</span>
        <textarea name="teilnehmer" rows={3} defaultValue={a?.teilnehmer ?? ""} placeholder={"je Zeile eine Person, z. B.\nErika Muster (Käuferin)\nHans Bau (Bauleitung)"} />
      </label>
      {a?.art !== "handwerker" && (
        <>
          <div className="raster">
            {ZAEHLER.map((z) => (
              <Feld key={z} label={ZAEHLER_TEXT[z]} name={`zaehler_${z}`} wert={a?.zaehler?.[z]} zahl />
            ))}
          </div>
          <Feld label="Übergebene Schlüssel" name="schluessel" wert={a?.schluessel} breit hinweis="z. B. 3 Wohnungsschlüssel, 1 Briefkasten, 1 Keller" />
        </>
      )}
      <label className="breit">
        <span>Bemerkung</span>
        <textarea name="bemerkung" rows={2} defaultValue={a?.bemerkung ?? ""} />
      </label>
    </>
  );
}
