import { EINHEIT_TYP_TEXT } from "@bt/domain";
import { Camera, CheckCircle2, Clock, Hammer, House, Send, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mängelanzeige", robots: { index: false, follow: false }, referrer: "no-referrer" };

const BASIS = process.env.API_URL ?? "http://localhost:3001";

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
}

const de = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
const STATUS_ICON = { eingegangen: Clock, in_bearbeitung: Hammer, erledigt: CheckCircle2 };

/** Käuferportal: Mängel melden und Bearbeitungsstand sehen – ohne Konto, über den persönlichen Link. */
export default async function PortalSeite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ gemeldet?: string; fehler?: string }> }) {
  const { token } = await params;
  const { gemeldet, fehler } = await searchParams;
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
  return (
    <>
      <header className="portal-kopf">
        <div className="portal-marke">
          <House size={20} /> {d.bautraeger.name}
        </div>
        <h1>Mängelanzeige</h1>
        <p>
          {adresse || d.objekt.bezeichnung} · {d.einheiten.map((e) => e.nr).join(", ")}
          <br />
          {d.kaeufer.join(", ")}
        </p>
      </header>

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

      <footer className="portal-fuss">
        {d.gewaehrleistungBis ? <p>Gewährleistung bis {de(d.gewaehrleistungBis)}.</p> : null}
        <p>
          {d.bautraeger.name}
          {d.bautraeger.anschrift ? ` · ${d.bautraeger.anschrift}` : ""} · Kaufvertrag {d.kaufvertrag}
        </p>
        <p>
          Ihre Angaben und Fotos werden ausschließlich zur Bearbeitung der Mängel verwendet und an die beauftragten Handwerksbetriebe weitergegeben. Dieser Link ist persönlich – bitte
          nicht weitergeben. Gültig bis {de(d.linkGueltigBis)}.
        </p>
      </footer>
    </>
  );
}
