export function EinstellungenReiter({ aktiv }: { aktiv: "allgemein" | "benachrichtigungen" }) {
  return (
    <nav className="reiter">
      <a href="/einstellungen" className={aktiv === "allgemein" ? "aktiv" : undefined}>
        Allgemein
      </a>
      <a href="/einstellungen/benachrichtigungen" className={aktiv === "benachrichtigungen" ? "aktiv" : undefined}>
        Benachrichtigungen
      </a>
    </nav>
  );
}
