"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

interface Ergebnis {
  fehler?: string[];
  meldung?: string;
}

/**
 * Formular, das eine Server Action aufruft, ohne die Eingaben zurückzusetzen.
 * Fehler aus der API werden oberhalb des Formulars angezeigt.
 */
export function Formular({
  aktion,
  children,
  knopf = "Speichern",
  knopfArt,
  bestaetigen,
  className = "formular",
  zuruecksetzen,
}: {
  aktion: (fd: FormData) => Promise<Ergebnis | void>;
  children?: ReactNode;
  /** Beschriftung des Absende-Knopfs; null = kein Knopf. */
  knopf?: string | null;
  knopfArt?: "zweitrangig" | "gefahr";
  bestaetigen?: string;
  className?: string;
  /** Formular nach Erfolg leeren (z. B. nach Upload oder Zahlungserfassung). */
  zuruecksetzen?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starte] = useTransition();

  function absenden(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (bestaetigen && !window.confirm(bestaetigen)) return;
    const fd = new FormData(ev.currentTarget);
    starte(async () => {
      const r = (await aktion(fd)) ?? {};
      setErgebnis(r);
      if (zuruecksetzen && !r.fehler?.length) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={absenden} className={className}>
      {ergebnis.fehler?.length ? (
        <div className="fehler" role="alert">
          {ergebnis.fehler.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      ) : null}
      {ergebnis.meldung ? <div className="meldung">{ergebnis.meldung}</div> : null}
      {children}
      {knopf !== null && (
        <div className="aktionen">
          <button type="submit" disabled={laeuft} className={knopfArt}>
            {laeuft ? "Bitte warten …" : knopf}
          </button>
        </div>
      )}
    </form>
  );
}
