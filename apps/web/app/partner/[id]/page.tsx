import { PhoneCall, ShieldAlert, ShieldCheck } from "lucide-react";
import { Dokumente } from "@/components/Dokumente";
import { Protokoll } from "@/components/Felder";
import { Formular } from "@/components/Formular";
import { api } from "@/lib/api";
import { deDatum, deZeit } from "@/lib/format";
import { partnerName, type Partner, type ProtokollEintrag } from "@/lib/typen";
import { partnerAendern, rueckrufDokumentieren } from "../aktionen";
import { PartnerFelder } from "../PartnerFelder";

export const dynamic = "force-dynamic";

interface IbanStatus {
  iban: string | null;
  letzteAenderung: { am: string; von: string; alt: string | null; neu: string | null } | null;
  offen: { am: string; von: string; alt: string | null; neu: string | null } | null;
  bestaetigungen: { iban: string; am: string; von: string; gespraechspartner: string; rueckrufAm: string; telefon: string | null; bemerkung: string | null }[];
}

export default async function PartnerBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, protokoll, bank] = await Promise.all([api<Partner>(`/partner/${id}`), api<ProtokollEintrag[]>(`/protokoll/${id}`), api<IbanStatus>(`/partner/${id}/iban`)]);
  const iban = (s: string | null) => (s ? s.replace(/(.{4})/g, "$1 ").trim() : "–");
  return (
    <>
      <p className="brotkrumen">
        <a href="/partner">Geschäftspartner</a> ›
      </p>
      <h1>
        {p.nr} · {partnerName(p) || p.suchcode}
      </h1>
      <Formular aktion={partnerAendern.bind(null, id)}>
        <PartnerFelder p={p} />
      </Formular>
      {p.iban || bank.bestaetigungen.length ? (
        <section className="karte bankverbindung" id="bankverbindung">
          <h2 className="mitsymbol">{bank.offen ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />} Bankverbindung</h2>
          {bank.offen ? (
            <div className="hinweisbox gefahr">
              <ShieldAlert size={16} />
              <span>
                IBAN am {deZeit(bank.offen.am)} von {bank.offen.von} geändert{bank.offen.alt ? ` (vorher ${iban(bank.offen.alt)})` : ""}. Vor der nächsten Zahlung beim Handwerker unter der <b>bereits bekannten</b> Telefonnummer
                zurückrufen – nicht unter einer Nummer aus der Mail oder Rechnung – und hier dokumentieren.
              </span>
            </div>
          ) : bank.letzteAenderung ? (
            <p className="hint">Letzte Änderung der IBAN am {deZeit(bank.letzteAenderung.am)} von {bank.letzteAenderung.von} – bestätigt.</p>
          ) : null}
          <p>
            Aktuelle IBAN: <b className="mono">{iban(bank.iban)}</b>
          </p>
          {p.iban ? (
            <details className="eingang-neu" open={!!bank.offen}>
              <summary className="mitsymbol">
                <PhoneCall size={15} /> Rückruf dokumentieren
              </summary>
              <Formular aktion={rueckrufDokumentieren.bind(null, id)} knopf="Rückruf dokumentieren" zuruecksetzen>
                <div className="raster">
                  <label>
                    <span>Rückruf am</span>
                    <input type="date" name="rueckrufAm" defaultValue={new Date().toISOString().slice(0, 10)} required />
                  </label>
                  <label>
                    <span>Gesprächspartner</span>
                    <input name="gespraechspartner" required maxLength={120} placeholder="z. B. Herr Kaiser, Inhaber" />
                  </label>
                  <label>
                    <span>angerufene Nummer (bekannt aus …)</span>
                    <input name="telefon" defaultValue={p.telefon ?? ""} maxLength={60} />
                  </label>
                  <label>
                    <span>Bemerkung</span>
                    <input name="bemerkung" maxLength={500} placeholder="z. B. Kontowechsel zur Volksbank bestätigt" />
                  </label>
                </div>
                <p className="hint">Mit Microsoft-Anmeldung muss den Rückruf eine andere Person dokumentieren als die, die die IBAN geändert hat.</p>
              </Formular>
            </details>
          ) : null}
          {bank.bestaetigungen.length ? (
            <ul className="rueckrufe">
              {bank.bestaetigungen.map((b) => (
                <li key={b.am}>
                  <b>{deDatum(b.rueckrufAm)}</b> mit {b.gespraechspartner}
                  {b.telefon ? ` (${b.telefon})` : ""} – IBAN {iban(b.iban)}
                  <span className="hint">
                    {" "}
                    · dokumentiert von {b.von}
                    {b.bemerkung ? ` · ${b.bemerkung}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <h2>Dokumente</h2>
      <Dokumente objektTyp="geschaeftspartner" objektId={id} pfad={`/partner/${id}`} />
      <details className="karte">
        <summary>Änderungsprotokoll ({protokoll.length})</summary>
        <Protokoll eintraege={protokoll} />
      </details>
    </>
  );
}
