"use client";

import { useTransition } from "react";

/** Kleine Zelle im Bautenstand-Raster: zeigt das Fertigdatum, Klick nimmt die Meldung (nach Rückfrage) zurück. */
export function MeldungZuruecknehmen({
  aktion,
  datum,
  titel,
}: {
  aktion: () => Promise<{ fehler?: string[] } | void>;
  datum: string;
  titel: string;
}) {
  const [laeuft, starte] = useTransition();
  return (
    <button
      type="button"
      className="zelle fertig"
      disabled={laeuft}
      title={`${titel} – fertig am ${datum}. Klicken zum Zurücknehmen.`}
      onClick={() => {
        if (!window.confirm(`Fertigmeldung „${titel}“ vom ${datum} zurücknehmen?`)) return;
        starte(async () => {
          const r = await aktion();
          if (r && r.fehler?.length) window.alert(r.fehler.join("\n"));
        });
      }}
    >
      ✓ <small>{datum.slice(0, 6)}</small>
    </button>
  );
}
