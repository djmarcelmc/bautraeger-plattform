import { FileDown } from "lucide-react";

/** Öffnet die Druckansicht als PDF – mit hinterlegtem Briefbogen der Gesellschaft. */
export function PdfKnopf({ pfad, briefbogen }: { pfad: string; briefbogen: boolean }) {
  return (
    <a className="knopf zweitrangig" href={`/schreiben/pdf?pfad=${encodeURIComponent(pfad)}`} target="_blank" rel="noreferrer" title={briefbogen ? "PDF auf dem Briefbogen der Gesellschaft" : "PDF ohne Briefbogen (bei der Gesellschaft hinterlegbar)"}>
      <FileDown size={16} /> {briefbogen ? "PDF mit Briefbogen" : "PDF"}
    </a>
  );
}
