"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import type { AktionsErgebnis } from "@/lib/formular";

/** Knopf „an Steuerberater“ in der Stapelliste; Ergebnis erscheint als Kurzhinweis daneben. */
export function StapelSenden({ aktion, erneut }: { aktion: () => Promise<AktionsErgebnis>; erneut: boolean }) {
  const [laeuft, starte] = useTransition();
  const [text, setText] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      {text ? <span className={text.ok ? "meldung-kurz" : "fehler-kurz"}>{text.text}</span> : null}
      <button
        type="button"
        className="zweitrangig klein"
        disabled={laeuft}
        onClick={() => {
          if (erneut && !window.confirm("Diesen Stapel erneut an den Steuerberater senden?")) return;
          starte(async () => {
            const r = await aktion();
            setText(r.fehler?.length ? { ok: false, text: r.fehler.join(" ") } : { ok: true, text: "in den Postausgang gestellt" });
          });
        }}
      >
        <Send size={13} /> {erneut ? "erneut senden" : "an Steuerberater"}
      </button>
    </>
  );
}
