"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { alsErgebnis, type AktionsErgebnis } from "@/lib/formular";
import { seiteAlsPdf, seitenAlsPdf } from "@/lib/pdf";

/** Erzeugt das Schreiben als PDF und stellt es mit Begleittext in den Postausgang. */
export async function schreibenVersenden(art: "zahlungsanforderung" | "mahnung" | "sonderwunsch", id: string, pfad: string, fd: FormData): Promise<AktionsErgebnis> {
  let pdf: Buffer;
  try {
    pdf = await seiteAlsPdf(pfad);
  } catch (e) {
    return { fehler: [`PDF konnte nicht erzeugt werden: ${(e as Error).message}`] };
  }
  const ziel = new FormData();
  for (const k of ["an", "betreff", "text"]) ziel.set(k, String(fd.get(k) ?? ""));
  ziel.set("datei", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "schreiben.pdf");
  let r: { dateiname: string };
  try {
    r = await api<{ dateiname: string }>(`/schreiben/${art}/${id}/versenden`, { method: "POST", body: ziel });
  } catch (e) {
    return alsErgebnis(e);
  }
  revalidatePath(pfad.split("?")[0]!);
  return { meldung: `${r.dateiname} wurde in den Postausgang gestellt und am Kaufvertrag abgelegt.` };
}

type Art = "zahlungsanforderung" | "mahnung" | "sonderwunsch";
const druckPfad = (art: Art, id: string) => (art === "mahnung" ? `/mahnungen/druck?ids=${id}` : art === "zahlungsanforderung" ? `/zahlungsanforderungen/${id}` : `/sonderwuensche/${id}`);

interface SammelEintrag {
  id: string;
  nummer: string;
  an: string[];
  vermerke: { status: string }[];
}

/** Sammelversand (Mahnlauf, Sammelanforderung): alle Schreiben mit E-Mail-Adresse und Standardtext. */
export async function sammelVersenden(art: Art, ids: string[], fd: FormData): Promise<AktionsErgebnis> {
  const erneut = fd.get("erneut") === "on";
  let zuSenden: SammelEintrag[];
  try {
    const l = await api<{ schreiben: SammelEintrag[] }>(`/schreiben/${art}?ids=${ids.join(",")}`);
    zuSenden = l.schreiben.filter((s) => s.an.length && (erneut || !s.vermerke.some((v) => v.status !== "fehler")));
  } catch (e) {
    return alsErgebnis(e);
  }
  if (!zuSenden.length) return { fehler: ["Es gibt nichts zu versenden – alle Schreiben mit E-Mail-Adresse wurden bereits verschickt."] };
  let pdfs: Buffer[];
  try {
    pdfs = await seitenAlsPdf(zuSenden.map((s) => druckPfad(art, s.id)));
  } catch (e) {
    return { fehler: [`PDF konnte nicht erzeugt werden: ${(e as Error).message}`] };
  }
  const fehler: string[] = [];
  let gesendet = 0;
  for (const [i, s] of zuSenden.entries()) {
    const ziel = new FormData();
    ziel.set("datei", new Blob([new Uint8Array(pdfs[i]!)], { type: "application/pdf" }), "schreiben.pdf");
    try {
      await api(`/schreiben/${art}/${s.id}/versenden-standard`, { method: "POST", body: ziel });
      gesendet++;
    } catch (e) {
      fehler.push(`${s.nummer}: ${(e as Error).message}`);
    }
  }
  revalidatePath("/schreiben/sammelversand");
  return { meldung: gesendet ? `${gesendet} Schreiben als PDF in den Postausgang gestellt und an den Kaufverträgen abgelegt.` : undefined, fehler: fehler.length ? fehler : undefined };
}
