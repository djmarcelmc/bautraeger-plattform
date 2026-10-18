import { BEREICH_TEXT } from "@bt/domain";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Circle,
  ClipboardList,
  HandCoins,
  HardHat,
  Landmark,
  PartyPopper,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Cockpit, CockpitAufgabe, Gesellschaft, Partner, ProjektListe } from "@/lib/typen";

export const dynamic = "force-dynamic";

const ICON: Record<CockpitAufgabe["bereich"], LucideIcon> = {
  verkauf: HandCoins,
  kosten: ClipboardList,
  maengel: Wrench,
  sicherheiten: ShieldCheck,
  bau: HardHat,
  steuern: Landmark,
  einstellungen: Settings,
};

function begruessung() {
  const stunde = Number(new Date().toLocaleString("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }));
  return stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
}

export default async function Uebersicht({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const { bereich } = await searchParams;
  let daten: { c: Cockpit; g: Gesellschaft[]; p: ProjektListe[]; k: Partner[] } | undefined;
  try {
    const [c, g, p, k] = await Promise.all([api<Cockpit>("/cockpit"), api<Gesellschaft[]>("/gesellschaften"), api<ProjektListe[]>("/projekte?abgeschlossen=nein"), api<Partner[]>("/partner")]);
    daten = { c, g, p, k };
  } catch {
    daten = undefined;
  }
  if (!daten)
    return (
      <>
        <h1>Übersicht</h1>
        <div className="fehler">API nicht erreichbar – läuft `pnpm dev:api`?</div>
      </>
    );
  const { c, g, p, k } = daten;
  const einheiten = p.reduce((s, x) => s + x.einheiten, 0);
  const schritte = [
    { fertig: g.length > 0, text: "Gesellschaft mit DATEV-Daten anlegen", href: "/gesellschaften" },
    { fertig: p.length > 0, text: "Erstes Projekt anlegen", href: "/projekte/neu" },
    { fertig: einheiten > 0, text: "Einheiten und Stellplätze erfassen", href: p[0] ? `/projekte/${p[0].id}` : "/projekte" },
    { fertig: k.length > 0, text: "Geschäftspartner (Käufer, Handwerker) anlegen", href: "/partner/neu" },
  ];
  const bereiche = [...new Set(c.aufgaben.map((a) => a.bereich))];
  const sichtbar = bereich ? c.aufgaben.filter((a) => a.bereich === bereich) : c.aufgaben;
  const kz = c.kennzahlen;
  const datum = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  return (
    <>
      <div className="seitenkopf">
        <div>
          <h1>{begruessung()}</h1>
          <p className="untertitel">
            {datum} ·{" "}
            {c.anzahl.hoch
              ? `${c.anzahl.hoch} dringende ${c.anzahl.hoch === 1 ? "Aufgabe" : "Aufgaben"}`
              : c.aufgaben.length
                ? "nichts Dringendes"
                : "alles erledigt"}
          </p>
        </div>
      </div>
      <div className="kpis">
        <a className={`kpi${c.anzahl.hoch ? " kpi-warnung" : ""}`} href="#aufgaben">
          <span>Aufgaben</span>
          <b>{c.anzahl.hoch + c.anzahl.mittel}</b>
          <small>
            {c.anzahl.hoch} dringend · {c.anzahl.mittel} demnächst · {c.anzahl.info} zur Info
          </small>
        </a>
        <a className={`kpi${Number(kz.ueberfaellig) ? " kpi-warnung" : ""}`} href="/verkauf?reiter=op">
          <span>Offene Forderungen</span>
          <b>{deZahl(kz.offeneForderungen, 0)} €</b>
          <small>davon überfällig {deZahl(kz.ueberfaellig, 0)} €</small>
        </a>
        <a className="kpi" href="/zahlungslaeufe">
          <span>Zu zahlen</span>
          <b>{deZahl(kz.zuZahlen, 0)} €</b>
          <small>freigegebene Rechnungen</small>
        </a>
        <a className="kpi" href="/maengel">
          <span>Offene Mängel</span>
          <b>{kz.offeneMaengel}</b>
          <small>in {kz.projekte} laufenden Projekten</small>
        </a>
      </div>

      <div className="cockpit">
        <section id="aufgaben">
          <div className="cockpitkopf">
            <h2>Was ist zu tun?</h2>
            {bereiche.length > 1 && (
              <nav className="segment">
                <a href="/" className={!bereich ? "aktiv" : undefined}>
                  Alle
                </a>
                {bereiche.map((b) => (
                  <a key={b} href={`/?bereich=${b}`} className={bereich === b ? "aktiv" : undefined}>
                    {BEREICH_TEXT[b]}
                  </a>
                ))}
              </nav>
            )}
          </div>
          {sichtbar.length ? (
            <ul className="aufgaben">
              {sichtbar.map((a, i) => {
                const Icon = ICON[a.bereich];
                return (
                  <li key={i} className={`aufgabe ${a.dringlichkeit}`}>
                    <a href={a.link}>
                      <span className="aufgabe-icon">
                        <Icon size={18} />
                      </span>
                      <span className="aufgabe-inhalt">
                        <b>{a.titel}</b>
                        <small>{a.text}</small>
                        {a.projekt ? <span className="badge">{a.projekt}</span> : null}
                      </span>
                      <span className="aufgabe-rechts">
                        {a.betrag ? <b>{deZahl(a.betrag, 0)} €</b> : null}
                        {a.datum ? <small>{deDatum(a.datum)}</small> : null}
                      </span>
                      <ArrowRight size={16} className="aufgabe-pfeil" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="karte leer">
              <PartyPopper size={22} /> Keine offenen Aufgaben – alles im grünen Bereich.
            </div>
          )}
        </section>

        <aside>
          {!schritte.every((s) => s.fertig) && (
            <section className="karte">
              <h2>Erste Schritte</h2>
              <ul className="schritte">
                {schritte.map((s) => (
                  <li key={s.text} className={s.fertig ? "fertig" : undefined}>
                    {s.fertig ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    <a href={s.href}>{s.text}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="karte">
            <h2>Laufende Projekte</h2>
            {p.length ? (
              <ul className="liste">
                {p.slice(0, 8).map((x) => (
                  <li key={x.id}>
                    <a href={`/projekte/${x.id}`}>
                      <span className="projektnr">{x.nr}</span> {x.suchcode}
                      <small>{x.ort}</small>
                      <ArrowRight size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Noch keine Projekte.</p>
            )}
          </section>
          <section className="karte schnellzugriff">
            <h2>Schnellzugriff</h2>
            <a href="/zahlungslaeufe">
              <Banknote size={16} /> Zahlungslauf erstellen
            </a>
            <a href="/verkauf?reiter=mahnwesen">
              <HandCoins size={16} /> Mahnvorschlag
            </a>
            <a href="/maengel/neu">
              <Wrench size={16} /> Mangel erfassen
            </a>
            <a href="/auswertungen/liquiditaetsplan">
              <Landmark size={16} /> Liquiditätsplan
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}
