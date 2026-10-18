export function EinstellungenReiter({ aktiv }: { aktiv: "allgemein" | "benachrichtigungen" | "import" }) {
  return (
    <nav className="reiter">
      <a href="/einstellungen" className={aktiv === "allgemein" ? "aktiv" : undefined}>
        Allgemein
      </a>
      <a href="/einstellungen/benachrichtigungen" className={aktiv === "benachrichtigungen" ? "aktiv" : undefined}>
        Benachrichtigungen
      </a>
      <a href="/einstellungen/import" className={aktiv === "import" ? "aktiv" : undefined}>
        Datenimport
      </a>
    </nav>
  );
}
