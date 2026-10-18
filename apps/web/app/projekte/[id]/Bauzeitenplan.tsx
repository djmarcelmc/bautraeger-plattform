import { MABV_ABSCHNITTE } from "@bt/domain";
import type { CSSProperties } from "react";
import { CalendarRange, Flag, LineChart, TriangleAlert } from "lucide-react";
import { Auswahl, Feld } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZahl } from "@/lib/format";
import type { Bauzeitenplan as Plan, Kostenkontrolle, Vorgang } from "@/lib/typen";
import { bauzeitenplanAnlegen, bauzeitenplanVerschieben, vorgangAendern, vorgangAnlegen, vorgangLoeschen } from "../bauzeit-aktionen";

const TAG = 86_400_000;
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const ABSCHNITT_TEXT = Object.fromEntries(MABV_ABSCHNITTE.map((a, i) => [a.key, `${i + 1}. ${a.bezeichnung}`]));
const KURZ: Record<string, string> = {
  erdarbeiten: "Beginn Erdarbeiten",
  rohbau: "Rohbau fertig",
  dach: "Dach",
  heizung: "Heizung roh",
  sanitaer: "Sanitär roh",
  elektro: "Elektro roh",
  fenster: "Fenster",
  innenputz: "Innenputz",
  estrich: "Estrich",
  fliesen: "Fliesen",
  bezugsfertigkeit: "Bezugsfertig",
  fassade: "Fassade",
  fertigstellung: "Fertigstellung",
};

/** Formularfelder eines Vorgangs. */
function VorgangFelder({ v, gewerke, belegt, vorgaenge }: { v?: Vorgang; gewerke: Kostenkontrolle["gewerke"]; belegt: Set<string>; vorgaenge: Vorgang[] }) {
  return (
    <>
      <div className="raster">
        <Feld label="Nr." name="nr" wert={v?.nr} zahl hinweis={v ? undefined : "leer = ans Ende"} />
        <Feld label="Bezeichnung" name="bezeichnung" wert={v?.bezeichnung} pflicht breit />
        <Feld label="Beginn" name="beginn" typ="date" wert={v?.beginn} pflicht />
        <Feld label="Ende (Plan)" name="ende" typ="date" wert={v?.ende} pflicht />
        <Feld label="Ende (Ist)" name="endeIst" typ="date" wert={v?.endeIst} hinweis="wenn erledigt" />
        <Auswahl
          label="MaBV-Meilenstein"
          name="mabvAbschnitt"
          wert={v?.mabvAbschnitt}
          leer="– keiner –"
          optionen={MABV_ABSCHNITTE.filter((a) => a.key === v?.mabvAbschnitt || !belegt.has(a.key)).map((a) => ({ wert: a.key, text: ABSCHNITT_TEXT[a.key]! }))}
        />
      </div>
      <label className="breit">
        <span>Gewerke (Kostenabfluss)</span>
        <select name="gewerkIds" multiple size={Math.min(8, Math.max(3, gewerke.length))} defaultValue={v?.gewerkIds ?? []}>
          {gewerke.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nr} {g.bezeichnung} – Trend {deZahl(g.stand.trend, 0)} €
            </option>
          ))}
        </select>
        <small>Mehrfachauswahl mit Strg bzw. ⌘. Der noch nicht berechnete Teil der Gewerke wird gleichmäßig über die Dauer des Vorgangs verteilt.</small>
      </label>
      {vorgaenge.length > (v ? 1 : 0) && (
        <label className="breit">
          <span>Vorgänger (beginnt nach deren Ende)</span>
          <select name="vorgaengerIds" multiple size={Math.min(6, Math.max(3, vorgaenge.length - 1))} defaultValue={v?.vorgaenger.map((x) => x.id) ?? []}>
            {vorgaenge
              .filter((x) => x.id !== v?.id)
              .map((x) => {
                const a = v?.vorgaenger.find((y) => y.id === x.id);
                return (
                  <option key={x.id} value={x.id}>
                    {x.nr} {x.bezeichnung}
                    {a && a.abstandTage !== 0 ? ` (${a.abstandTage > 0 ? "+" : ""}${a.abstandTage} Tage)` : ""}
                  </option>
                );
              })}
          </select>
          <small>Verzögert sich ein Vorgänger, rückt dieser Vorgang samt seinen Nachfolgern automatisch nach (Dauer bleibt gleich). Erledigte Vorgänge bleiben stehen.</small>
        </label>
      )}
    </>
  );
}

export async function BauzeitReiter({ projektId, baubeginnSoll }: { projektId: string; baubeginnSoll: string | null }) {
  const [plan, kosten] = await Promise.all([api<Plan>(`/projekte/${projektId}/bauzeitenplan`), api<Kostenkontrolle>(`/projekte/${projektId}/kosten`)]);
  const belegt = new Set(plan.vorgaenge.flatMap((v) => (v.mabvAbschnitt ? [v.mabvAbschnitt] : [])));
  const neuerVorgang = (
    <Formular aktion={vorgangAnlegen.bind(null, projektId)} knopf="Vorgang anlegen" zuruecksetzen>
      <VorgangFelder gewerke={kosten.gewerke} belegt={belegt} vorgaenge={plan.vorgaenge} />
    </Formular>
  );

  if (!plan.vorgaenge.length)
    return (
      <div className="zweispaltig">
        <section className="karte">
          <h2>Bauzeitenplan aus Vorlage</h2>
          <p className="hint">
            Legt 25 Vorgänge eines typischen Mehrfamilienhauses an (ca. 54 Wochen Bauzeit, vom Grundstückserwerb bis zur Abnahme des Gemeinschaftseigentums), mit allen
            13 MaBV-Meilensteinen. Die Gewerke werden über ihre Nummer verknüpft{kosten.gewerke.length ? "" : " – lege dafür vorher den Gewerkeplan an"}. Alles ist danach anpassbar.
          </p>
          <Formular aktion={bauzeitenplanAnlegen.bind(null, projektId)} knopf="Bauzeitenplan anlegen">
            <Feld label="Baubeginn (Beginn Erdarbeiten)" name="baubeginn" typ="date" wert={baubeginnSoll} pflicht />
          </Formular>
        </section>
        <section className="karte">
          <h2>Einzelner Vorgang</h2>
          {neuerVorgang}
        </section>
      </div>
    );

  const heute = new Date().toISOString().slice(0, 10);
  const start = Date.parse(plan.beginn!.slice(0, 8) + "01");
  const endeMonat = new Date(plan.ende!);
  const ende = Date.UTC(endeMonat.getUTCFullYear(), endeMonat.getUTCMonth() + 2, 1);
  const pos = (d: string, plusTag = 0) => (((Date.parse(d) + plusTag * TAG - start) / (ende - start)) * 100).toFixed(3) + "%";
  const monate: { text: string; links: string; jahr: boolean }[] = [];
  for (let d = new Date(start); d.getTime() < ende; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    monate.push({ text: d.getUTCMonth() === 0 ? `Jan ’${String(d.getUTCFullYear()).slice(2)}` : MONATE[d.getUTCMonth()]!, links: pos(iso), jahr: d.getUTCMonth() === 0 });
  }
  const heuteImPlan = Date.parse(heute) >= start && Date.parse(heute) < ende;
  const ms = (k: string) => plan.vorgaenge.find((v) => v.mabvAbschnitt === k)?.meilenstein;
  const ueberfaellig = plan.vorgaenge.filter((v) => !v.endeIst && v.ende < heute).length;

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <span>Baubeginn</span>
          <b>{deDatum(ms("erdarbeiten") ?? null) || "–"}</b>
          <small>Beginn Erdarbeiten</small>
        </div>
        <div className="kpi">
          <span>Bezugsfertig</span>
          <b>{deDatum(ms("bezugsfertigkeit") ?? null) || "–"}</b>
          <small>Übergabe Sondereigentum</small>
        </div>
        <div className="kpi">
          <span>Fertigstellung</span>
          <b>{deDatum(ms("fertigstellung") ?? null) || "–"}</b>
          <small>Planende {deDatum(plan.ende)}</small>
        </div>
        <div className={`kpi${ueberfaellig || plan.gewerkeOhneVorgang.length ? " kpi-warnung" : ""}`}>
          <span>Hinweise</span>
          <b>{ueberfaellig}</b>
          <small>
            Vorgänge über Plan-Ende · {plan.gewerkeOhneVorgang.length} Gewerke ohne Vorgang
          </small>
        </div>
      </div>

      <div className="karte ohne-innenabstand gantt-rahmen">
        <div className="gantt">
          <div className="gantt-kopf">
            <div className="gantt-label">Vorgang</div>
            <div className="gantt-spur">
              {monate.map((m) => (
                <span key={m.links} className={`gantt-monat${m.jahr ? " jahr" : ""}`} style={{ left: m.links }}>
                  {m.text}
                </span>
              ))}
            </div>
          </div>
          {plan.vorgaenge.map((v) => {
            const istEnde = v.endeIst ?? v.ende;
            const zustand = v.endeIst ? "erledigt" : v.ende < heute ? "verzug" : v.beginn <= heute ? "laeuft" : "geplant";
            return (
              <details key={v.id} className="gantt-zeile">
                <summary>
                  <div className="gantt-label">
                    <span className="gantt-nr">{v.nr}</span>
                    <span className="gantt-text">
                      {v.bezeichnung}
                      <small>
                        {v.gewerke.length ? v.gewerke.map((g) => g.nr).join(", ") : v.mabvAbschnitt ? "" : "ohne Gewerk"}
                        {v.vorgaenger.length ? `${v.gewerke.length ? " · " : ""}nach ${v.vorgaenger.map((x) => x.nr).join(", ")}` : ""}
                      </small>
                    </span>
                  </div>
                  <div className="gantt-spur">
                    {monate.map((m) => (
                      <i key={m.links} className="gantt-raster" style={{ left: m.links }} />
                    ))}
                    <span
                      className={`gantt-balken ${zustand}${v.kritisch && !v.endeIst ? " kritisch" : ""}`}
                      style={{ left: pos(v.beginn), width: `calc(${pos(istEnde, 1)} - ${pos(v.beginn)})` }}
                      title={`${deDatum(v.beginn)} – ${deDatum(istEnde)}${v.endeIst ? " (erledigt)" : ""}`}
                    />
                    {v.meilenstein ? (
                      <span className="gantt-meilenstein" style={{ left: pos(v.meilenstein) }} title={`${KURZ[v.mabvAbschnitt!]}: ${deDatum(v.meilenstein)}`}>
                        <Flag size={11} />
                        <em>
                          {KURZ[v.mabvAbschnitt!]}
                          {plan.einheiten ? ` · ${v.gemeldet}/${plan.einheiten}` : ""}
                        </em>
                      </span>
                    ) : null}
                  </div>
                </summary>
                <div className="gantt-bearbeiten">
                  <Formular aktion={vorgangAendern.bind(null, projektId, v.id)} knopf="Speichern">
                    <VorgangFelder v={v} gewerke={kosten.gewerke} belegt={belegt} vorgaenge={plan.vorgaenge} />
                  </Formular>
                  <Formular aktion={vorgangLoeschen.bind(null, projektId, v.id)} knopf="Vorgang löschen" knopfArt="gefahr" bestaetigen={`Vorgang „${v.bezeichnung}“ löschen?`} className="formular rechts" />
                </div>
              </details>
            );
          })}
          {heuteImPlan ? <div className="gantt-heute" style={{ "--anteil": (Date.parse(heute) - start) / (ende - start) } as CSSProperties} title={`Heute, ${deDatum(heute)}`} /> : null}
        </div>
      </div>
      <p className="hint gantt-legende">
        <span className="gantt-balken geplant" /> geplant <span className="gantt-balken laeuft" /> läuft <span className="gantt-balken verzug" /> über Plan-Ende{" "}
        <span className="gantt-balken erledigt" /> erledigt{" "}
        {plan.vorgaenge.some((v) => v.kritisch) ? (
          <>
            <span className="gantt-balken geplant kritisch" /> kritischer Pfad (ohne Puffer bis zum Bauende){" "}
          </>
        ) : null}
        <Flag size={11} /> MaBV-Meilenstein mit gemeldeten Einheiten · Zeile anklicken zum Bearbeiten
      </p>

      {plan.gewerkeOhneVorgang.length ? (
        <div className="hinweisbox">
          <TriangleAlert size={16} />
          <div>
            <b>Gewerke ohne Vorgang:</b> {plan.gewerkeOhneVorgang.map((g) => `${g.nr} ${g.bezeichnung}`).join(", ")}. Ihr Kostenrest wird im Liquiditätsplan gleichmäßig über die
            gesamte Bauzeit verteilt.
          </div>
        </div>
      ) : null}

      <div className="zweispaltig">
        <section className="karte">
          <h2>
            <CalendarRange size={18} /> Plan verschieben
          </h2>
          <p className="hint">Verschiebt alle noch nicht erledigten Vorgänge (ohne Ist-Ende), optional erst ab einer Vorgangsnummer – z. B. bei Verzug im Rohbau.</p>
          <Formular aktion={bauzeitenplanVerschieben.bind(null, projektId)} knopf="Verschieben">
            <div className="raster">
              <Feld label="Tage (negativ = vorziehen)" name="tage" zahl pflicht />
              <Feld label="ab Vorgang Nr." name="abNr" zahl />
            </div>
          </Formular>
          <p>
            <a href={`/auswertungen/liquiditaetsplan?projekt=${projektId}`} className="mitsymbol">
              <LineChart size={16} /> Liquiditätsplan für dieses Projekt
            </a>
          </p>
        </section>
        <section className="karte">
          <h2>Vorgang hinzufügen</h2>
          {neuerVorgang}
        </section>
      </div>
    </>
  );
}
