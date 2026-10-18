import { PROJEKTART_TEXT } from "@bt/domain";
import { Auswahl, Feld, Gruppe, Haken } from "@/components/Felder";
import type { Gesellschaft, Projekt } from "@/lib/typen";

export function ProjektFelder({
  p,
  gesellschaften,
  vorschlagNr,
}: {
  p?: Projekt;
  gesellschaften: Gesellschaft[];
  vorschlagNr?: number;
}) {
  return (
    <>
      <Gruppe titel="Stammdaten">
        <Auswahl
          label="Gesellschaft"
          name="gesellschaftId"
          wert={p?.gesellschaftId ?? gesellschaften[0]?.id}
          pflicht
          optionen={gesellschaften.map((g) => ({ wert: g.id, text: `${g.nr} · ${g.name}` }))}
        />
        <Feld label="Projekt-Nr." name="nr" wert={p?.nr ?? vorschlagNr} pflicht zahl />
        <Feld label="Suchcode" name="suchcode" wert={p?.suchcode} pflicht />
        <Feld label="Straße" name="strasse" wert={p?.strasse} breit />
        <Feld label="PLZ" name="plz" wert={p?.plz} />
        <Feld label="Ort" name="ort" wert={p?.ort} />
      </Gruppe>
      <Gruppe titel="Projektart & Steuern">
        <Auswahl
          label="Projektart"
          name="art"
          wert={p?.art ?? "bautraeger"}
          optionen={Object.entries(PROJEKTART_TEXT).map(([wert, text]) => ({ wert, text }))}
        />
        <Feld label="Kostenstelle (DATEV)" name="kostenstelle" wert={p?.kostenstelle} hinweis="leer = Projekt-Nr." />
        <Haken label="§ 13b UStG anwendbar" name="para13bAnwendbar" wert={p?.para13bAnwendbar} />
      </Gruppe>
      <Gruppe titel="Grundbuch">
        <Feld label="Grundbuchamt" name="grundbuchamt" wert={p?.grundbuchamt} />
        <Feld label="Blatt-Nr." name="grundbuchBlatt" wert={p?.grundbuchBlatt} />
        <Feld label="Flurstück" name="flurstueck" wert={p?.flurstueck} />
      </Gruppe>
      <Gruppe titel="Termine">
        <Feld label="Projektbeginn" name="projektbeginn" typ="date" wert={p?.projektbeginn} />
        <Feld label="Baubeginn Soll" name="baubeginnSoll" typ="date" wert={p?.baubeginnSoll} />
        <Feld label="Baubeginn Ist" name="baubeginnIst" typ="date" wert={p?.baubeginnIst} />
        <Feld label="Fertigstellung Soll" name="fertigstellungSoll" typ="date" wert={p?.fertigstellungSoll} />
        <Feld label="Fertigstellung Ist" name="fertigstellungIst" typ="date" wert={p?.fertigstellungIst} />
        {p ? <Haken label="Projekt abgeschlossen" name="abgeschlossen" wert={p.abgeschlossen} /> : null}
      </Gruppe>
    </>
  );
}
