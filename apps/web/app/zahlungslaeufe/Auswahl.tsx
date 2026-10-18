"use client";

import { useState } from "react";

/** Checkbox je Rechnung mit laufender Summe der Auswahl. */
export function Auswahlsumme({ formId, start }: { formId: string; start: number }) {
  const [summe, setSumme] = useState(start);
  const [anzahl, setAnzahl] = useState<number | null>(null);
  return (
    <span
      className="auswahlsumme"
      ref={(el) => {
        const form = el?.closest("form") ?? document.getElementById(formId);
        if (!form || form.dataset.verbunden) return;
        form.dataset.verbunden = "1";
        form.addEventListener("change", () => {
          const boxen = [...form.querySelectorAll<HTMLInputElement>("input[name=rechnungIds]:checked")];
          setSumme(boxen.reduce((s, b) => s + Number(b.dataset.betrag ?? 0), 0));
          setAnzahl(boxen.length);
        });
      }}
    >
      {anzahl !== null ? `${anzahl} ausgewählt · ` : ""}
      <b>{summe.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b>
    </span>
  );
}
