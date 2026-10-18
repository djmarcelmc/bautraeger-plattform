"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";

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
}: {
  aktion: (fd: FormData) => Promise<Ergebnis | void>;
  children?: ReactNode;
  knopf?: string;
  knopfArt?: "zweitrangig" | "gefahr";
  bestaetigen?: string;
  className?: string;
}) {
  const [ergebnis, setErgebnis] = useState<Ergebnis>({});
  const [laeuft, starte] = useTransition();

  function absenden(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (bestaetigen && !window.confirm(bestaetigen)) return;
    const fd = new FormData(ev.currentTarget);
    starte(async () => setErgebnis((await aktion(fd)) ?? {}));
  }

  return (
    <form onSubmit={absenden} className={className}>
      {ergebnis.fehler?.length ? (
        <div className="fehler" role="alert">
          {ergebnis.fehler.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      ) : null}
      {ergebnis.meldung ? <div className="meldung">{ergebnis.meldung}</div> : null}
      {children}
      <div className="aktionen">
        <button type="submit" disabled={laeuft} className={knopfArt}>
          {laeuft ? "Bitte warten …" : knopf}
        </button>
      </div>
    </form>
  );
}
