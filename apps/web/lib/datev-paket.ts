import "server-only";
import { strToU8, zipSync } from "fflate";
import { apiRoh } from "./api";
import { seitenAlsPdf } from "./pdf";

interface Beleg {
  belegnr: string;
  art: string;
  id: string;
  datum: string;
  betrag: string;
  text: string;
  dokumente: { id: string; dateiname: string; mimeType: string | null }[];
  pfad: string | null;
}

const dateiSicher = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Beleg";
const endung = (name: string) => /\.[A-Za-z0-9]{2,5}$/.exec(name)?.[0].toLowerCase() ?? ".pdf";
const csvFeld = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * ZIP für den Steuerberater: EXTF-Buchungsstapel, Belege (benannt nach Belegnummer = Belegfeld 1) und Belegliste.
 * Versandte Zahlungsanforderungen werden aus der Ablage genommen, sonst als PDF erzeugt; Rechnungsscans aus der Ablage.
 */
export async function datevPaket(csv: { name: string; daten: Uint8Array }, belege: Beleg[]): Promise<{ zip: Uint8Array; fehlend: number }> {
  const dateien: Record<string, Uint8Array> = { [csv.name]: csv.daten };
  const liste: string[][] = [["Belegnummer", "Belegdatum", "Betrag", "Art", "Buchungstext", "Datei"]];
  const vergeben = new Set<string>();
  const name = (basis: string, ext: string) => {
    let n = `Belege/${basis}${ext}`;
    for (let i = 2; vergeben.has(n); i++) n = `Belege/${basis}_${i}${ext}`;
    vergeben.add(n);
    return n;
  };
  // Druckansichten gesammelt rendern (ein Browser); scheitert das, einzeln versuchen
  const pfade = belege.filter((b) => b.pfad).map((b) => b.pfad!);
  const gerendert = new Map<string, Uint8Array>();
  if (pfade.length) {
    try {
      (await seitenAlsPdf(pfade)).forEach((pdf, i) => gerendert.set(pfade[i]!, pdf));
    } catch {
      for (const p of pfade) {
        try {
          gerendert.set(p, (await seitenAlsPdf([p]))[0]!);
        } catch {
          /* fehlt in der Belegliste */
        }
      }
    }
  }
  let fehlend = 0;
  for (const b of belege) {
    const basis = dateiSicher(b.belegnr);
    const namen: string[] = [];
    for (const d of b.dokumente) {
      const res = await apiRoh(`/dokumente/${d.id}/datei`);
      if (!res.ok) continue;
      const n = name(basis, endung(d.dateiname));
      dateien[n] = new Uint8Array(await res.arrayBuffer());
      namen.push(n);
    }
    if (b.pfad && gerendert.has(b.pfad)) {
      const n = name(basis, ".pdf");
      dateien[n] = gerendert.get(b.pfad)!;
      namen.push(n);
    }
    if (!namen.length) fehlend++;
    liste.push([b.belegnr, b.datum.split("-").reverse().join("."), b.betrag.replace(".", ","), b.art, b.text, namen.join(", ") || "kein Beleg in der Ablage"]);
  }
  dateien["Belegliste.csv"] = strToU8(`﻿${liste.map((z) => z.map(csvFeld).join(";")).join("\r\n")}\r\n`);
  dateien["LIESMICH.txt"] = strToU8(
    [
      "DATEV-Paket aus der Bauträger-Plattform",
      "",
      `${csv.name}: Buchungsstapel im DATEV-Format (EXTF) – in DATEV Rechnungswesen über „Stapelverarbeitung > Import“ einlesen.`,
      "Belege/: Belegbilder, benannt nach der Belegnummer (Belegfeld 1 im Buchungsstapel). In DATEV Unternehmen online",
      "über „Belege hochladen“ übergeben; die Zuordnung zur Buchung erfolgt über Belegnummer, Datum und Betrag.",
      "Belegliste.csv: Übersicht aller Belege des Stapels; „kein Beleg in der Ablage“ = bitte Original nachreichen.",
      "Zahlungseingänge und Übergaben haben keinen eigenen Beleg (Kontoauszug bzw. Übergabeprotokoll).",
      "",
    ].join("\r\n"),
  );
  return { zip: zipSync(dateien, { level: 6 }), fehlend };
}
