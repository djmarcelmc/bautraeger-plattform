"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** DATEV-Export: lädt die Datei herunter und aktualisiert danach das Journal (Buchungen sind dann festgeschrieben). */
export function ExportFormular({ gesellschaftId, von, bis, bereit, neu }: { gesellschaftId: string; von: string; bis: string; bereit: boolean; neu: number }) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function absenden(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    setMeldung(null);
    try {
      const res = await fetch("/buchhaltung/export", { method: "POST", body: new FormData(e.currentTarget) });
      if (!res.ok) {
        setFehler(await res.text());
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "EXTF_Buchungsstapel.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      setMeldung(`${name} erstellt – die Buchungen sind als exportiert festgeschrieben.`);
      router.refresh();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form className="formular exportformular" onSubmit={absenden}>
      <input type="hidden" name="gesellschaftId" value={gesellschaftId} />
      <div className="raster">
        <label>
          <span>Belegdatum von</span>
          <input type="date" name="von" defaultValue={von} required />
        </label>
        <label>
          <span>bis</span>
          <input type="date" name="bis" defaultValue={bis} required />
        </label>
      </div>
      <label className="haken">
        <input type="checkbox" name="nurNeue" defaultChecked />
        <span>nur noch nicht exportierte Buchungen ({neu})</span>
      </label>
      {fehler ? <p className="fehler">{fehler}</p> : null}
      {meldung ? <p className="meldung">{meldung}</p> : null}
      <div className="knopfleiste">
        <button type="submit" disabled={!bereit || laeuft}>
          <Download size={16} /> {laeuft ? "Export läuft …" : "DATEV-Buchungsstapel erstellen"}
        </button>
      </div>
      {!bereit ? <p className="hint">Für den Export fehlen DATEV-Berater- und Mandantennummer bei der Gesellschaft.</p> : null}
    </form>
  );
}
