import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Camera, CheckCircle2, Clock, Download, FileText, Hammer, House, Send, Sparkles, TriangleAlert, Wallet, Wrench } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Käuferportal", robots: { index: false, follow: false }, referrer: "no-referrer" };

const BASIS = process.env.API_URL ?? "http://localhost:3001";

type RatenStand = "nicht_faellig" | "demnaechst" | "angefordert" | "ueberfaellig" | "teilbezahlt" | "bezahlt" | "verrechnet";
interface Portal {
  objekt: { strasse: string | null; plz: string | null; ort: string | null; bezeichnung: string };
  bautraeger: { name: string; anschrift: string | null };
  kaufvertrag: string;
  kaeufer: string[];
  einheiten: { id: string; nr: string; typ: string; art: string | null; etage: string | null }[];
  gewaehrleistungBis: string | null;
  linkGueltigBis: string;
  maengel: { nr: number; titel: string; ort: string | null; gemeldetAm: string; erledigtAm: string | null; gemeinschaft: boolean; status: "eingegangen" | "in_bearbeitung" | "erledigt"; statusText: string }[];
  maxFotos: number;
  zahlungen: { kaufpreis: string; sonderwuensche: string; gesamt: string; angefordert: string; bezahlt: string; offen: string; ueberfaellig: string; naechsteFaelligkeit: string | null };
  offeneRechnungen: { rechnungsnr: string; angefordertAm: string; faelligAm: string; betrag: string; offen: string; ueberfaellig: boolean }[];
  raten: { nr: number; text: string | null; prozent: string | null; betrag: string; bezahlt: string; rechnungsnr: string | null; faelligAm: string | null; sonderwunsch: boolean; stand: RatenStand; standText: string }[];
  sonderwuensche: { nr: number; bezeichnung: string; beschreibung: string | null; gutschrift: boolean; betrag: string; status: "angebot" | "beauftragt" | "abgelehnt"; statusText: string; gueltigBis: string | null }[];
  dokumente: { id: string; dateiname: string; ordner: string | null; beschreibung: string | null; groesse: number | null; angelegtAm: string }[];
}

const de = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const eur = (v: string | number) => `${Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const STATUS_ICON = { eingegangen: Clock, in_bearbeitung: Hammer, erledigt: CheckCircle2 };
const STAND_KLASSE: Record<RatenStand, string> = {
  nicht_faellig: "neutral",
  demnaechst: "eingegangen",
  angefordert: "in_bearbeitung",
  ueberfaellig: "ueberfaellig",
  teilbezahlt: "in_bearbeitung",
  bezahlt: "erledigt",
  verrechnet: "erledigt",
};
const BEREICHE = [
  ["uebersicht", "Übersicht", House],
  ["zahlungen", "Zahlungen", Wallet],
  ["unterlagen", "Unterlagen", FileText],
  ["sonderwuensche", "Sonderwünsche", Sparkles],
  ["maengel", "Mängel", Wrench],
] as const;
type Bereich = (typeof BEREICHE)[number][0];

/** Käuferportal: Zahlungsstand, Unterlagen, Sonderwünsche und Mängel – ohne Konto, über den persönlichen Link. */
export default async function PortalSeite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ gemeldet?: string; fehler?: string; bereich?: string }> }) {
  const { token } = await params;
  const { gemeldet, fehler, bereich: b } = await searchParams;
  const bereich: Bereich = gemeldet || fehler ? "maengel" : (BEREICHE.find(([k]) => k === b)?.[0] ?? "uebersicht");
  const res = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await fetch(`${BASIS}/api/portal/${encodeURIComponent(token)}`, { cache: "no-store" }) : null;
  if (!res?.ok)
    return (
      <div className="portal-karte portal-leer">
        <TriangleAlert size={28} />
        <h1>Link ungültig oder abgelaufen</h1>
        <p>Bitte wenden Sie sich an Ihren Bauträger, um einen neuen Link zu erhalten.</p>
      </div>
    );
  const d = (await res.json()) as Portal;
  const adresse = [d.objekt.strasse, [d.objekt.plz, d.objekt.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const einheitText = (e: Portal["einheiten"][number]) =>
    `${EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? e.typ} ${e.nr}${e.art ? ` · ${e.art}` : ""}${e.etage ? ` · ${e.etage}` : ""}`;
  const wohnungen = d.einheiten.filter((e) => e.typ !== "stellplatz");
  const auswahl = wohnungen.length ? [...wohnungen, ...d.einheiten.filter((e) => e.typ === "stellplatz")] : d.einheiten;
  const z = d.zahlungen;
  const anteil = Number(z.gesamt) ? Math.min(100, (Number(z.bezahlt) / Number(z.gesamt)) * 100) : 0;
  const offeneMaengel = d.maengel.filter((m) => m.status !== "erledigt").length;
  const offeneAngebote = d.sonderwuensche.filter((s) => s.status === "angebot");
  const link = (k: Bereich) => `/portal/${token}${k === "uebersicht" ? "" : `?bereich=${k}`}`;
  const dokumentLink = (id: string) => `/portal/${token}/dokument/${id}`;
  const groesse = (n: number | null) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : "");

  const DokListe = ({ liste }: { liste: Portal["dokumente"] }) => (
    <ul className="portal-liste">
      {liste.map((x) => (
        <li key={x.id}>
          <div>
            <b>{x.dateiname}</b>
            <small>
              {[x.ordner === "Schriftverkehr" ? "Schreiben an Sie" : x.beschreibung || "Unterlage", de(x.angelegtAm), groesse(x.groesse)].filter(Boolean).join(" · ")}
            </small>
          </div>
          <a className="portal-knopf" href={dokumentLink(x.id)}>
            <Download size={15} /> Herunterladen
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <header className="portal-kopf">
        <div className="portal-marke">
          <House size={20} /> {d.bautraeger.name}
        </div>
        <h1>Ihr Kaufvertrag {d.kaufvertrag}</h1>
        <p>
          {adresse || d.objekt.bezeichnung} · {d.einheiten.map((e) => e.nr).join(", ")}
          <br />
          {d.kaeufer.join(", ")}
        </p>
      </header>

      <nav className="portal-reiter" aria-label="Bereiche">
        {BEREICHE.map(([k, text, Icon]) => (
          <a key={k} href={link(k)} className={bereich === k ? "aktiv" : undefined} aria-current={bereich === k ? "page" : undefined}>
            <Icon size={16} /> {text}
            {k === "maengel" && offeneMaengel ? <span className="portal-zahl">{offeneMaengel}</span> : null}
            {k === "sonderwuensche" && offeneAngebote.length ? <span className="portal-zahl">{offeneAngebote.length}</span> : null}
          </a>
        ))}
      </nav>

      {bereich === "uebersicht" && (
        <>
          <section className="portal-karte">
            <h2>Zahlungsstand</h2>
            <div className="portal-zahlen">
              <div>
                <small>Kaufpreis{Number(z.sonderwuensche) ? " inkl. Sonderwünsche" : ""}</small>
                <b>{eur(z.gesamt)}</b>
              </div>
              <div>
                <small>bezahlt</small>
                <b>{eur(z.bezahlt)}</b>
              </div>
              <div className={Number(z.ueberfaellig) > 0 ? "warnung" : undefined}>
                <small>offen{z.naechsteFaelligkeit ? ` · fällig ab ${de(z.naechsteFaelligkeit)}` : ""}</small>
                <b>{eur(z.offen)}</b>
              </div>
            </div>
            <div className="portal-balken" aria-label={`${Math.round(anteil)} % bezahlt`}>
              <div style={{ width: `${anteil}%` }} />
            </div>
            {d.offeneRechnungen.length ? (
              <ul className="portal-liste">
                {d.offeneRechnungen.map((r) => (
                  <li key={r.rechnungsnr}>
                    <div>
                      <b>{r.rechnungsnr}</b>
                      <small>
                        vom {de(r.angefordertAm)} · fällig am {de(r.faelligAm)}
                      </small>
                    </div>
                    <span className={`portal-status ${r.ueberfaellig ? "ueberfaellig" : "in_bearbeitung"}`}>
                      {eur(r.offen)} {r.ueberfaellig ? "überfällig" : "offen"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="portal-klein">Derzeit sind keine Zahlungen offen.</p>
            )}
            <a className="portal-mehr" href={link("zahlungen")}>
              Alle Raten ansehen →
            </a>
          </section>

          <div className="portal-raster">
            <section className="portal-karte">
              <h2>Neueste Unterlagen</h2>
              {d.dokumente.length ? <DokListe liste={d.dokumente.slice(0, 3)} /> : <p className="portal-klein">Noch keine Unterlagen.</p>}
              {d.dokumente.length > 3 ? (
                <a className="portal-mehr" href={link("unterlagen")}>
                  Alle {d.dokumente.length} Unterlagen →
                </a>
              ) : null}
            </section>
            <section className="portal-karte">
              <h2>Auf einen Blick</h2>
              <ul className="portal-liste">
                <li>
                  <div>
                    <b>Mängel</b>
                    <small>{offeneMaengel ? `${offeneMaengel} in Bearbeitung` : "keine offenen Meldungen"}</small>
                  </div>
                  <a className="portal-knopf" href={link("maengel")}>
                    Mangel melden
                  </a>
                </li>
                <li>
                  <div>
                    <b>Sonderwünsche</b>
                    <small>{offeneAngebote.length ? `${offeneAngebote.length} Angebot(e) zur Entscheidung` : `${d.sonderwuensche.filter((s) => s.status === "beauftragt").length} beauftragt`}</small>
                  </div>
                  <a className="portal-knopf" href={link("sonderwuensche")}>
                    Ansehen
                  </a>
                </li>
                {d.gewaehrleistungBis ? (
                  <li>
                    <div>
                      <b>Gewährleistung</b>
                      <small>bis {de(d.gewaehrleistungBis)}</small>
                    </div>
                  </li>
                ) : null}
              </ul>
            </section>
          </div>
        </>
      )}

      {bereich === "zahlungen" && (
        <section className="portal-karte">
          <h2>Raten und Zahlungen</h2>
          <p className="portal-klein">
            Die Raten werden nach Baufortschritt angefordert (§ 3 Abs. 2 MaBV). Bitte geben Sie bei Überweisungen immer die Rechnungsnummer an.
          </p>
          <ul className="portal-liste portal-raten">
            {d.raten.map((r) => (
              <li key={r.nr}>
                <div>
                  <b>
                    {r.nr}. {r.text}
                  </b>
                  <small>
                    {r.prozent && Number(r.prozent) ? `${Number(r.prozent).toLocaleString("de-DE")} % · ` : ""}
                    {r.rechnungsnr ? `${r.rechnungsnr}${r.faelligAm ? `, fällig am ${de(r.faelligAm)}` : ""}` : r.sonderwunsch ? "Sonderwunsch" : "noch nicht angefordert"}
                    {Number(r.bezahlt) > 0 && r.stand !== "bezahlt" ? ` · bezahlt ${eur(r.bezahlt)}` : ""}
                  </small>
                </div>
                <div className="portal-rechts">
                  <b>{eur(r.betrag)}</b>
                  <span className={`portal-status ${STAND_KLASSE[r.stand]}`}>{r.standText}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="portal-summe">
            <span>Gesamt</span>
            <b>{eur(z.gesamt)}</b>
            <span>davon bezahlt</span>
            <b>{eur(z.bezahlt)}</b>
          </div>
        </section>
      )}

      {bereich === "unterlagen" && (
        <section className="portal-karte">
          <h2>Ihre Unterlagen</h2>
          <p className="portal-klein">Schreiben, die wir Ihnen geschickt haben, und Unterlagen, die wir für Sie bereitgestellt haben.</p>
          {d.dokumente.length ? <DokListe liste={d.dokumente} /> : <p className="portal-klein">Noch keine Unterlagen.</p>}
        </section>
      )}

      {bereich === "sonderwuensche" && (
        <section className="portal-karte">
          <h2>Ihre Sonderwünsche</h2>
          {d.sonderwuensche.length ? (
            <ul className="portal-liste">
              {d.sonderwuensche.map((s) => (
                <li key={s.nr}>
                  <div>
                    <b>{s.bezeichnung}</b>
                    <small>
                      Nr. {s.nr}
                      {s.gutschrift ? " · Gutschrift" : ""}
                      {s.gueltigBis ? ` · Angebot gültig bis ${de(s.gueltigBis)}` : ""}
                      {s.beschreibung ? ` · ${s.beschreibung}` : ""}
                    </small>
                  </div>
                  <div className="portal-rechts">
                    <b>
                      {s.gutschrift ? "− " : ""}
                      {eur(s.betrag)}
                    </b>
                    <span className={`portal-status ${s.status === "beauftragt" ? "erledigt" : s.status === "angebot" ? "eingegangen" : "neutral"}`}>{s.statusText}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="portal-klein">Keine Sonderwünsche vereinbart.</p>
          )}
          {offeneAngebote.length ? (
            <p className="portal-klein">Zur Beauftragung senden Sie uns bitte die unterschriebene Auftragserteilung aus dem Angebot zurück – Sie finden es unter „Unterlagen“.</p>
          ) : null}
        </section>
      )}

      {bereich === "maengel" && (
        <>
          {gemeldet && (
            <div className="portal-hinweis erfolg" role="status">
              <CheckCircle2 size={18} /> Vielen Dank! Ihre Meldung Nr. {gemeldet} ist eingegangen. Wir melden uns, um einen Termin zu vereinbaren.
            </div>
          )}
          {fehler && (
            <div className="portal-hinweis fehler" role="alert">
              <TriangleAlert size={18} /> {fehler}
            </div>
          )}

      <section className="portal-karte">
          <h2>Neuen Mangel melden</h2>
          <form action={`/portal/${token}/melden`} method="post" encType="multipart/form-data" className="portal-formular">
            {auswahl.length > 1 ? (
              <label>
                <span>Einheit</span>
                <select name="einheitId" required defaultValue={auswahl[0]!.id}>
                  {auswahl.map((e) => (
                    <option key={e.id} value={e.id}>
                      {einheitText(e)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="einheitId" value={auswahl[0]?.id} />
            )}
            <fieldset className="portal-wahl">
              <legend>Wo befindet sich der Mangel?</legend>
              <label>
                <input type="radio" name="bereich" value="sonder" defaultChecked /> In meiner Wohnung / meinem Stellplatz
              </label>
              <label>
                <input type="radio" name="bereich" value="gemeinschaft" /> Im Gemeinschaftseigentum (z. B. Treppenhaus, Fassade, Außenanlage)
              </label>
            </fieldset>
            <label>
              <span>Was ist der Mangel? *</span>
              <input name="titel" required maxLength={150} placeholder="z. B. Fenster im Wohnzimmer undicht" />
            </label>
            <label>
              <span>Genaue Stelle</span>
              <input name="ort" maxLength={150} placeholder="z. B. Wohnzimmer, Fenster links" />
            </label>
            <label>
              <span>Beschreibung</span>
              <textarea name="beschreibung" rows={4} maxLength={3000} placeholder="Seit wann? Wann tritt es auf? Was haben Sie beobachtet?" />
            </label>
            <label className="portal-fotos">
              <span>
                <Camera size={16} /> Fotos (bis zu {d.maxFotos}, zusammen höchstens 25 MB)
              </span>
              <input type="file" name="fotos" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple />
            </label>
            <label>
              <span>Wie und wann sind Sie für einen Termin erreichbar?</span>
              <input name="kontakt" maxLength={200} placeholder="z. B. 0711 123456, werktags ab 16 Uhr" />
            </label>
            <button type="submit">
              <Send size={16} /> Mangel melden
            </button>
          </form>
        </section>

        <section className="portal-karte">
          <h2>Ihre Meldungen</h2>
          {d.maengel.length ? (
            <ul className="portal-liste">
              {d.maengel.map((m) => {
                const Icon = STATUS_ICON[m.status];
                return (
                  <li key={m.nr}>
                    <div>
                      <b>{m.titel}</b>
                      <small>
                        Nr. {m.nr} · gemeldet am {de(m.gemeldetAm)}
                        {m.ort ? ` · ${m.ort}` : ""}
                        {m.gemeinschaft ? " · Gemeinschaftseigentum" : ""}
                      </small>
                    </div>
                    <span className={`portal-status ${m.status}`}>
                      <Icon size={14} /> {m.statusText}
                      {m.erledigtAm ? ` am ${de(m.erledigtAm)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="portal-klein">Noch keine Meldungen.</p>
          )}
        </section>
        </>
      )}

      <footer className="portal-fuss">
        {d.gewaehrleistungBis ? <p>Gewährleistung bis {de(d.gewaehrleistungBis)}.</p> : null}
        <p>
          {d.bautraeger.name}
          {d.bautraeger.anschrift ? ` · ${d.bautraeger.anschrift}` : ""} · Kaufvertrag {d.kaufvertrag}
        </p>
        <p>
          Ihre Angaben und Fotos zu Mängeln werden ausschließlich zu deren Bearbeitung verwendet und an die beauftragten Handwerksbetriebe weitergegeben. Dieser Link ist persönlich – bitte
          nicht weitergeben. Gültig bis {de(d.linkGueltigBis)}.
        </p>
      </footer>
    </>
  );
}
