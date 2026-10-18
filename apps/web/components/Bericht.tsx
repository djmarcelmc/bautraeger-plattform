import { FileSpreadsheet, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { deDatum } from "@/lib/format";
import { DruckKnopf } from "./DruckKnopf";

/** Rahmen einer Auswertung: Kopf mit Titel/Stand, Aktionen (Drucken, Excel) und Inhalt; druckt im Querformat. */
export function Bericht({ titel, untertitel, stand, excel, zurueck, filter, children }: { titel: string; untertitel?: string; stand: string; excel: string; zurueck?: ReactNode; filter?: ReactNode; children: ReactNode }) {
  return (
    <div className="bericht">
      <div className="nur-bildschirm">
        <p className="brotkrumen">
          <a href="/auswertungen">Auswertungen</a> › {zurueck}
        </p>
      </div>
      <div className="seitenkopf berichtskopf">
        <div>
          <h1>{titel}</h1>
          <p className="untertitel">
            {untertitel ? `${untertitel} · ` : ""}Stand {deDatum(stand)} · Beträge brutto in €
          </p>
        </div>
        <div className="aktionen nur-bildschirm">
          <a className="knopf zweitrangig-link" href={excel}>
            <FileSpreadsheet size={16} /> Excel
          </a>
          <DruckKnopf>
            <Printer size={16} /> Drucken / PDF
          </DruckKnopf>
        </div>
      </div>
      {filter ? <div className="nur-bildschirm">{filter}</div> : null}
      {children}
    </div>
  );
}
