import { EINHEIT_TYP_TEXT, MANGELARTEN } from "@bt/domain";
import { Auswahl, Feld, Gruppe, Haken } from "@/components/Felder";
import { deZahl } from "@/lib/format";
import type { EinheitKurz, Kostenkontrolle, MangelDetail } from "@/lib/typen";

/** Felder eines Mangels; die Verträge kommen aus der Kostenkontrolle des Projekts. */
export function MangelFelder({ m, projektId, einheiten, kosten }: { m?: MangelDetail; projektId: string; einheiten: EinheitKurz[]; kosten: Kostenkontrolle }) {
  const vertraege = kosten.gewerke.flatMap((g) =>
    g.vertraege.map((v) => ({ wert: v.id, text: `${g.nr} ${g.bezeichnung} – ${v.handwerker?.firma ?? v.handwerker?.nachname ?? v.handwerker?.suchcode ?? "?"}` })),
  );
  const heute = new Date().toISOString().slice(0, 10);
  return (
    <>
      <input type="hidden" name="projektId" value={projektId} />
      <Gruppe titel="Mangel">
        <Feld label="Kurzbeschreibung" name="titel" wert={m?.titel} pflicht breit />
        <Feld label="Lage / Ort" name="ort" wert={m?.ort} hinweis="z. B. Bad OG, Dusche" />
        <Auswahl label="Mangelart" name="mangelart" wert={m?.mangelart} leer="– wählen –" optionen={MANGELARTEN.map((a) => ({ wert: a, text: a }))} />
        <label className="breit">
          <span>Beschreibung</span>
          <textarea name="beschreibung" rows={4} defaultValue={m?.beschreibung ?? ""} />
        </label>
      </Gruppe>
      <Gruppe titel="Zuordnung">
        <Auswahl
          label="Einheit"
          name="einheitId"
          wert={m?.einheitId}
          leer="– Gemeinschaft / keine –"
          optionen={einheiten.map((e) => ({ wert: e.id, text: `${e.nr} ${EINHEIT_TYP_TEXT[e.typ as keyof typeof EINHEIT_TYP_TEXT] ?? ""}` }))}
        />
        <Auswahl label="Verantwortlicher Handwerker (Vertrag)" name="handwerkervertragId" wert={m?.handwerkervertragId} leer="– noch offen –" optionen={vertraege} />
        <Auswahl
          label="Eigentum"
          name="eigentum"
          wert={m?.eigentum ?? "sonder"}
          optionen={[
            { wert: "sonder", text: "Sondereigentum" },
            { wert: "gemeinschaft", text: "Gemeinschaftseigentum" },
          ]}
        />
        <Feld label="Festgestellt am" name="festgestelltAm" typ="date" wert={m?.festgestelltAm ?? heute} pflicht />
        <Feld label="Festgestellt durch" name="festgestelltDurch" wert={m?.festgestelltDurch} hinweis="z. B. Abnahme, Kunde, Gutachter" />
      </Gruppe>
      <Gruppe titel="Werte & Termine">
        <Feld label="Wert Handwerker brutto €" name="wertHandwerkerBrutto" wert={deZahl(m?.wertHandwerkerBrutto)} zahl />
        <Feld label="Wert Kunde brutto €" name="wertKundeBrutto" wert={deZahl(m?.wertKundeBrutto)} zahl />
        <Haken label="Einbehalt beim Handwerker" name="einbehalt" wert={m?.einbehalt} />
        <Feld label="Angebot angefordert am" name="angebotsanforderungAm" typ="date" wert={m?.angebotsanforderungAm} />
        <Feld label="Auftrag erteilt am" name="auftragserteilungAm" typ="date" wert={m?.auftragserteilungAm} />
        <Feld label="Ersatzvornahme am" name="ersatzvornahmeAm" typ="date" wert={m?.ersatzvornahmeAm} />
      </Gruppe>
    </>
  );
}
