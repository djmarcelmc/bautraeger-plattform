"use client";

import { Copy, Link2, Mail } from "lucide-react";
import { useState, useTransition } from "react";

/** Erzeugt den Portal-Link und zeigt ihn einmalig zum Kopieren bzw. als E-Mail-Entwurf. */
export function PortalLinkErzeugen({
  aktion,
  vorhanden,
  email,
  anrede,
}: {
  aktion: (fd: FormData) => Promise<{ link?: string; gueltigBis?: string; fehler?: string[] }>;
  vorhanden: boolean;
  email: string | null;
  anrede: string;
}) {
  const [ergebnis, setErgebnis] = useState<{ link?: string; gueltigBis?: string; fehler?: string[] }>({});
  const [kopiert, setKopiert] = useState(false);
  const [laeuft, starte] = useTransition();
  const mail = ergebnis.link
    ? `mailto:${email ?? ""}?subject=${encodeURIComponent("Ihr persönliches Käuferportal")}&body=${encodeURIComponent(
        `${anrede},\n\nüber den folgenden persönlichen Link sehen Sie jederzeit den Zahlungsstand Ihres Kaufvertrags, Ihre Unterlagen und Sonderwünsche und können uns Mängel mit Fotos melden:\n\n${ergebnis.link}\n\nBitte geben Sie den Link nicht weiter.\n\nMit freundlichen Grüßen`,
      )}`
    : undefined;
  return (
    <div className="portallink">
      <form
        className="formular"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (vorhanden && !window.confirm("Neuen Link erzeugen? Der bisherige Link funktioniert danach nicht mehr.")) return;
          const fd = new FormData(ev.currentTarget);
          starte(async () => setErgebnis(await aktion(fd)));
        }}
      >
        {ergebnis.fehler?.length ? <div className="fehler">{ergebnis.fehler.join(" ")}</div> : null}
        <div className="raster">
          <label>
            <span>gültig bis</span>
            <input type="date" name="gueltigBis" />
            <small>leer = Ende der Gewährleistung bzw. 5 Jahre</small>
          </label>
        </div>
        <div className="knopfleiste">
          <button type="submit" disabled={laeuft}>
            <Link2 size={16} /> {laeuft ? "Bitte warten …" : vorhanden ? "Neuen Link erzeugen" : "Link erzeugen"}
          </button>
        </div>
      </form>
      {ergebnis.link && (
        <div className="meldung portallink-ergebnis">
          <p>
            <b>Link für den Käufer</b> (gültig bis {ergebnis.gueltigBis?.split("-").reverse().join(".")}) – wird nur jetzt angezeigt:
          </p>
          <code>{ergebnis.link}</code>
          <div className="knopfleiste">
            <button
              type="button"
              className="zweitrangig"
              onClick={async () => {
                await navigator.clipboard.writeText(ergebnis.link!);
                setKopiert(true);
              }}
            >
              <Copy size={16} /> {kopiert ? "Kopiert" : "Kopieren"}
            </button>
            <a className="knopf zweitrangig-link" href={mail}>
              <Mail size={16} /> Per E-Mail senden
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
