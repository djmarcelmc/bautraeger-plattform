import "server-only";
import { briefbogenCss, type BriefbogenEinstellung } from "@bt/domain";
import type { ReactNode } from "react";
import { api } from "./api";
import { deDatum } from "./format";

export interface Briefbogen {
  aktiv: boolean;
  /** CSS-Klasse für <article className="schreiben …"> */
  klasse: string;
  /** Stil und Kennung für die PDF-Erzeugung – als erstes Kind in das Schreiben setzen */
  kopf: ReactNode;
  /** Datum/Zeichen in vorgedruckte Felder des Briefbogens */
  felder: (datum: string | null) => ReactNode;
}

const OHNE: Briefbogen = { aktiv: false, klasse: "", kopf: null, felder: () => null };

/** Briefbogen der Gesellschaft für ein Schreiben (ohne hinterlegten Briefbogen: unverändertes Layout). */
export async function briefbogenFuer(gesellschaftId: string | null | undefined): Promise<Briefbogen> {
  if (!gesellschaftId) return OHNE;
  const b = await api<{ aktiv: boolean; dateiname: string | null; einstellung: BriefbogenEinstellung }>(`/gesellschaften/${gesellschaftId}/briefbogen`).catch(() => null);
  if (!b?.aktiv) return OHNE;
  const e = b.einstellung;
  return {
    aktiv: true,
    klasse: "briefbogen",
    kopf: (
      <>
        <style>{briefbogenCss(e)}</style>
        <meta name="briefbogen" content={gesellschaftId} />
        <div className="briefbogen-platzhalter nur-bildschirm" style={{ height: `${e.randObenErsteSeite - 14}mm` }}>
          Briefkopf aus „{b.dateiname}“ – erscheint im PDF und beim E-Mail-Versand
        </div>
      </>
    ),
    felder: (datum) => (
      <>
        {e.datumX !== null && datum ? <span className="briefbogen-feld briefbogen-datum">{deDatum(datum)}</span> : null}
        {e.zeichenX !== null && e.zeichenText ? <span className="briefbogen-feld briefbogen-zeichen">{e.zeichenText}</span> : null}
      </>
    ),
  };
}
