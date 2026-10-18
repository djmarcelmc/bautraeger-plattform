import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Bericht } from "@/components/Bericht";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { GewerkZeile, Kostenstand } from "@/lib/typen";
import { Abweichung } from "../../../kosten/Abweichung";

export const dynamic = "force-dynamic";

interface Projektbericht {
  projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { name: string };
  verkauf: {
    vertraege: {
      id: string;
      nr: string;
      urkundennr: string | null;
      datum: string | null;
      kaeufer: string[];
      einheiten: { nr: string; typ: string; vkBrutto: string }[];
      summen: { vertragssumme: string; angefordert: string; bezahlt: string; offen: string };
      bezahltProzent: string;
      zahlungen: { datum: string; betrag: string }[];
    }[];
    unverkauft: { id: string; nr: string; typ: string; art: string | null; wohnflaeche: string | null; vkBrutto: string | null }[];
    summen: { vertragssumme: string; angefordert: string; bezahlt: string; unverkauftPlan: string };
  };
  kosten: { summe: Kostenstand; vergeben: GewerkZeile[] };
  maengel: { offen: number; ueberfaellig: number };
  stand: string;
}

export default async function ProjektberichtSeite({ params }: { params: Promise<{ projektId: string }> }) {
  const { projektId } = await params;
  const b = await api<Projektbericht>(`/auswertungen/projektbericht/${projektId}`);
  const v = b.verkauf;
  const nochZuZahlen = (s: { vertragssumme: string; bezahlt: string }) => Number(s.vertragssumme) - Number(s.bezahlt);
  return (
    <Bericht
      titel={`Projektbericht ${b.projekt.nr} ${b.projekt.suchcode}`}
      untertitel={`${b.gesellschaft.name}${b.projekt.ort ? ` · ${[b.projekt.strasse, [b.projekt.plz, b.projekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}` : ""}`}
      stand={b.stand}
      excel={`/auswertungen/excel/projektbericht/${projektId}`}
      zurueck="Projektbericht"
    >
      <div className="kpis">
        <div className="kpi">
          <span>Verkauft</span>
          <b>{deZahl(v.summen.vertragssumme, 0)} €</b>
          <small>{v.vertraege.length} Kaufverträge</small>
        </div>
        <div className="kpi">
          <span>Bezahlt</span>
          <b>{deZahl(v.summen.bezahlt, 0)} €</b>
          <small>noch zu zahlen {deZahl(nochZuZahlen(v.summen), 0)} €</small>
        </div>
        <div className="kpi">
          <span>Zu verkaufen</span>
          <b>{deZahl(v.summen.unverkauftPlan, 0)} €</b>
          <small>{v.unverkauft.length} Einheiten (Listenpreis)</small>
        </div>
        <div className={`kpi${b.maengel.ueberfaellig ? " kpi-warnung" : ""}`}>
          <span>Offene Mängel</span>
          <b>{b.maengel.offen}</b>
          <small>{b.maengel.ueberfaellig} mit überschrittener Frist</small>
        </div>
      </div>

      <h2>Verkaufte Einheiten</h2>
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>Einheiten</th>
              <th>Vertrag / Urkunde</th>
              <th className="num">VK gesamt</th>
              <th className="num">angefordert</th>
              <th className="num">bezahlt</th>
              <th className="num">%</th>
              <th className="num">noch zu zahlen</th>
            </tr>
          </thead>
          <tbody>
            {v.vertraege.map((k) => (
              <tr key={k.id}>
                <td>
                  {k.kaeufer.join(", ")}
                  {k.zahlungen.length ? (
                    <div className="hint">Zahlungen: {k.zahlungen.map((z) => `${deDatum(z.datum)} ${deZahl(z.betrag, 0)} €`).join(" · ")}</div>
                  ) : null}
                </td>
                <td>{k.einheiten.map((e) => e.nr).join(", ")}</td>
                <td>
                  <a href={`/kaufvertraege/${k.id}`}>{k.nr}</a>
                  {k.urkundennr ? <div className="hint">{k.urkundennr}</div> : null}
                </td>
                <td className="num">{deZahl(k.summen.vertragssumme)}</td>
                <td className="num">{deZahl(k.summen.angefordert)}</td>
                <td className="num">{deZahl(k.summen.bezahlt)}</td>
                <td className="num">{deZahl(k.bezahltProzent, 1)}</td>
                <td className="num">{deZahl(nochZuZahlen(k.summen))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="summenzeile">
              <td colSpan={3}>
                <b>Summe</b>
              </td>
              <td className="num">{deZahl(v.summen.vertragssumme)}</td>
              <td className="num">{deZahl(v.summen.angefordert)}</td>
              <td className="num">{deZahl(v.summen.bezahlt)}</td>
              <td />
              <td className="num">{deZahl(nochZuZahlen(v.summen))}</td>
            </tr>
          </tfoot>
        </table>
        {!v.vertraege.length && <p className="leer">Noch nichts verkauft.</p>}
      </div>

      <h2>Zu verkaufen</h2>
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng">
          <thead>
            <tr>
              <th>Einheit</th>
              <th>Objektart</th>
              <th className="num">Fläche m²</th>
              <th className="num">VK Plan</th>
            </tr>
          </thead>
          <tbody>
            {v.unverkauft.map((e) => (
              <tr key={e.id}>
                <td>{e.nr}</td>
                <td>
                  {EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ}
                  {e.art ? ` ${e.art}` : ""}
                </td>
                <td className="num">{deZahl(e.wohnflaeche)}</td>
                <td className="num">{deZahl(e.vkBrutto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="summenzeile">
              <td colSpan={3}>
                <b>Summe</b>
              </td>
              <td className="num">{deZahl(v.summen.unverkauftPlan)}</td>
            </tr>
          </tfoot>
        </table>
        {!v.unverkauft.length && <p className="leer">Alle Einheiten verkauft.</p>}
      </div>

      <h2>Kosten</h2>
      <div className="karte ohne-innenabstand">
        <table className="berichtstabelle eng">
          <thead>
            <tr>
              <th>Gewerk / Vertragspartner</th>
              <th className="num">geschätzt</th>
              <th className="num">Summe vergeben</th>
              <th className="num">berechnet</th>
              <th className="num">bezahlt</th>
              <th className="num">Abweichung</th>
            </tr>
          </thead>
          <tbody>
            {b.kosten.vergeben.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.nr} {g.bezeichnung}
                  <div className="hint">{[...new Set(g.vertraege.map((x) => x.handwerker?.firma ?? x.handwerker?.nachname ?? x.handwerker?.suchcode))].join(", ")}</div>
                </td>
                <td className="num">{deZahl(g.stand.geschaetzt)}</td>
                <td className="num">{deZahl(g.stand.summeVergeben)}</td>
                <td className="num">{deZahl(g.stand.berechnet)}</td>
                <td className="num">{deZahl(g.stand.bezahlt)}</td>
                <td className="num">
                  <Abweichung wert={g.stand.abweichung} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="summenzeile">
              <td>
                <b>Projekt gesamt</b> <span className="hint">(alle Gewerke)</span>
              </td>
              <td className="num">{deZahl(b.kosten.summe.geschaetzt)}</td>
              <td className="num">{deZahl(b.kosten.summe.summeVergeben)}</td>
              <td className="num">{deZahl(b.kosten.summe.berechnet)}</td>
              <td className="num">{deZahl(b.kosten.summe.bezahlt)}</td>
              <td className="num">
                <Abweichung wert={b.kosten.summe.abweichung} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Bericht>
  );
}
