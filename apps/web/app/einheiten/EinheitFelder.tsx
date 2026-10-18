import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Auswahl, Feld, Gruppe } from "@/components/Felder";
import { deZahl } from "@/lib/format";
import type { Einheit, EinheitKurz } from "@/lib/typen";

export function EinheitFelder({ e, andere = [] }: { e?: Einheit; andere?: EinheitKurz[] }) {
  const zuordenbar = andere.filter((x) => x.id !== e?.id && x.typ !== "stellplatz");
  return (
    <>
      <Gruppe titel="Einheit">
        <Feld label="Einheiten-Nr." name="nr" wert={e?.nr} pflicht />
        <Auswahl
          label="Typ"
          name="typ"
          wert={e?.typ ?? "wohnung"}
          optionen={Object.entries(EINHEIT_TYP_TEXT).map(([wert, text]) => ({ wert, text }))}
        />
        <Feld label="Bauabschnitt" name="bauabschnitt" wert={e?.bauabschnitt ?? 1} zahl />
        <Feld label="Etage" name="etage" wert={e?.etage} />
        <Feld label="Art" name="art" wert={e?.art} hinweis="z. B. 4 ½ Zimmer" />
        <Auswahl
          label="Gehört zu Einheit"
          name="zugehoerigZuEinheitId"
          wert={e?.zugehoerigZuEinheitId}
          leer="– keine –"
          optionen={zuordenbar.map((x) => ({ wert: x.id, text: `${x.nr}${x.art ? ` · ${x.art}` : ""}` }))}
        />
      </Gruppe>
      <Gruppe titel="Flächen & Preise">
        <Feld label="Wohn-/Nutzfläche m²" name="wohnflaeche" wert={deZahl(e?.wohnflaeche)} zahl />
        <Feld label="Miteigentum ‰" name="miteigentumTsd" wert={deZahl(e?.miteigentumTsd, 3)} zahl />
        <Feld label="Preis pro m² €" name="preisProM2" wert={deZahl(e?.preisProM2)} zahl />
        <Feld label="Verkaufspreis brutto €" name="vkBrutto" wert={deZahl(e?.vkBrutto)} zahl />
        <Feld label="Mindest-VK €" name="mindestVk" wert={deZahl(e?.mindestVk)} zahl />
      </Gruppe>
    </>
  );
}
