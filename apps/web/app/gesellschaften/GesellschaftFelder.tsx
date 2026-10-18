import { Auswahl, Feld, Gruppe } from "@/components/Felder";
import type { Gesellschaft } from "@/lib/typen";

export function GesellschaftFelder({ g, vorschlagNr }: { g?: Gesellschaft; vorschlagNr?: number }) {
  return (
    <>
      <Gruppe titel="Gesellschaft">
        <Feld label="Nr." name="nr" wert={g?.nr ?? vorschlagNr} pflicht zahl />
        <Feld label="Name" name="name" wert={g?.name} pflicht breit />
        <Feld label="Anschrift" name="anschrift" wert={g?.anschrift} breit />
      </Gruppe>
      <Gruppe titel="DATEV">
        <Feld label="Beraternummer" name="datevBeraternr" wert={g?.datevBeraternr} zahl />
        <Feld label="Mandantennummer" name="datevMandantennr" wert={g?.datevMandantennr} zahl />
        <Auswahl
          label="Kontenrahmen"
          name="skr"
          wert={g?.skr ?? "03"}
          optionen={[
            { wert: "03", text: "SKR 03" },
            { wert: "04", text: "SKR 04" },
          ]}
        />
        <Feld label="Sachkontenlänge" name="sachkontenlaenge" wert={g?.sachkontenlaenge ?? 4} zahl />
      </Gruppe>
      <Gruppe titel="Bankverbindung (SEPA-Auftraggeberkonto)">
        <Feld label="IBAN" name="iban" wert={g?.iban?.replace(/(.{4})/g, "$1 ").trim()} breit hinweis="Von diesem Konto werden die Zahlungsläufe überwiesen" />
        <Feld label="BIC" name="bic" wert={g?.bic} hinweis="optional" />
      </Gruppe>
    </>
  );
}
