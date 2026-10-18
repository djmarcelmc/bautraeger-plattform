// Inbetriebnahme-Assistent: prüft die Checkliste aus docs/inbetriebnahme.md gegen den tatsächlichen Datenstand
// und zeigt je Punkt eine Ampel mit Hinweis und Link zur passenden Einstellung.

export type PruefStatus = "ok" | "warnung" | "fehlt" | "info";

export interface PruefPunkt {
  schluessel: string;
  titel: string;
  status: PruefStatus;
  text: string;
  link?: string;
}

export interface PruefGruppe {
  titel: string;
  punkte: PruefPunkt[];
}

export interface InbetriebnahmeStand {
  system: { anmeldungAktiv: boolean; mailVersand: "protokoll" | "smtp" | "microsoft365"; rechnungspostfach: string | null };
  gesellschaften: {
    id: string;
    nr: number;
    name: string;
    anschrift: boolean;
    steuernummer: boolean;
    datev: boolean;
    steuerberaterEmail: boolean;
    iban: boolean;
    briefbogen: boolean;
    kontierungEingestellt: boolean;
    datevExporte: number;
    bankimporte: number;
  }[];
  basiszinsFehlt: string | null;
  mangelvorlagen: number;
  partner: { gesamt: number; handwerker: number; handwerkerOhneIban: number; handwerkerOhneFreistellung: number; kaeufer: number; kaeuferOhneAnschrift: number; kaeuferOhneEmail: number };
  projekte: { id: string; nr: number; suchcode: string; einheiten: number; meaSumme: string | null }[];
  vorgaenge: { kaufvertraege: number; handwerkervertraege: number; buergschaften: number };
}

const de = (iso: string) => iso.split("-").reverse().join(".");
const liste = (namen: string[], max = 3) => `${namen.slice(0, max).join(", ")}${namen.length > max ? ` und ${namen.length - max} weitere` : ""}`;

export function inbetriebnahmePruefen(s: InbetriebnahmeStand): { gruppen: PruefGruppe[]; fortschritt: { ok: number; gesamt: number; prozent: number } } {
  const g = s.gesellschaften;
  const fehlend = (f: (x: InbetriebnahmeStand["gesellschaften"][number]) => boolean) => g.filter((x) => !f(x)).map((x) => `${x.nr} ${x.name}`);
  const proGesellschaft = (schluessel: string, titel: string, f: (x: InbetriebnahmeStand["gesellschaften"][number]) => boolean, okText: string, fehltText: string, status: PruefStatus = "fehlt"): PruefPunkt => {
    const offen = fehlend(f);
    return !g.length
      ? { schluessel, titel, status: "fehlt", text: "Noch keine Gesellschaft angelegt.", link: "/gesellschaften" }
      : offen.length
        ? { schluessel, titel, status, text: `${fehltText}: ${liste(offen)}.`, link: g.length === 1 || offen.length === 1 ? `/gesellschaften/${g.find((x) => !f(x))!.id}` : "/gesellschaften" }
        : { schluessel, titel, status: "ok", text: okText, link: "/gesellschaften" };
  };
  const p = s.partner;
  const meaFalsch = s.projekte.filter((x) => x.einheiten > 0 && x.meaSumme !== null && Math.abs(Number(x.meaSumme) - 1000) > 0.01);

  const gruppen: PruefGruppe[] = [
    {
      titel: "1. Server und Zugang",
      punkte: [
        s.system.anmeldungAktiv
          ? { schluessel: "anmeldung", titel: "Anmeldung", status: "ok", text: "Microsoft-Anmeldung mit Rollen ist eingeschaltet." }
          : { schluessel: "anmeldung", titel: "Anmeldung", status: "warnung", text: "Noch ohne Microsoft-Anmeldung (nur gemeinsamer Zugang mit Passwortschutz) – Vier-Augen-Prüfungen greifen erst mit Anmeldung." },
        s.system.mailVersand === "protokoll"
          ? { schluessel: "mail", titel: "E-Mail-Versand", status: "warnung", text: "Kein Versandweg eingerichtet – Mails werden nur protokolliert (Microsoft 365 oder SMTP einrichten).", link: "/einstellungen" }
          : { schluessel: "mail", titel: "E-Mail-Versand", status: "ok", text: `Versand über ${s.system.mailVersand === "microsoft365" ? "Microsoft 365" : "SMTP"} eingerichtet – Testmail unter Einstellungen senden.`, link: "/einstellungen" },
        s.system.rechnungspostfach
          ? { schluessel: "postfach", titel: "Rechnungspostfach", status: "ok", text: `Rechnungen werden aus ${s.system.rechnungspostfach} abgeholt.`, link: "/rechnungseingang" }
          : { schluessel: "postfach", titel: "Rechnungspostfach", status: "info", text: "Optional: Rechnungspostfach (z. B. rechnungen@…) anbinden – bis dahin Rechnungen hochladen.", link: "/rechnungseingang" },
      ],
    },
    {
      titel: "2. Grundeinstellungen",
      punkte: [
        proGesellschaft("stammdaten", "Gesellschaften: Anschrift und Steuernummer", (x) => x.anschrift && x.steuernummer, `${g.length} Gesellschaft(en) mit Anschrift und Steuernummer.`, "Anschrift oder Steuernummer fehlt bei"),
        proGesellschaft("datev", "DATEV-Berater-/Mandantennummer", (x) => x.datev, "Bei allen Gesellschaften eingetragen.", "Fehlt bei"),
        proGesellschaft("steuerberater", "E-Mail des Steuerberaters (Versand der DATEV-Stapel)", (x) => x.steuerberaterEmail, "Bei allen Gesellschaften hinterlegt.", "Noch keine Adresse bei", "warnung"),
        proGesellschaft("iban", "Bankverbindung (SEPA, Bankabgleich)", (x) => x.iban, "Bei allen Gesellschaften hinterlegt.", "IBAN fehlt bei"),
        proGesellschaft("briefbogen", "Briefbogen für Schreiben", (x) => x.briefbogen, "Bei allen Gesellschaften hinterlegt – Musterbrief prüfen.", "Noch kein Briefbogen bei", "warnung"),
        s.basiszinsFehlt
          ? { schluessel: "basiszins", titel: "Basiszinssatz", status: "fehlt", text: `Für das Halbjahr ab ${de(s.basiszinsFehlt)} fehlt der Basiszins.`, link: "/einstellungen" }
          : { schluessel: "basiszins", titel: "Basiszinssatz", status: "ok", text: "Aktuelles Halbjahr ist hinterlegt.", link: "/einstellungen" },
        s.mangelvorlagen
          ? { schluessel: "maengel", titel: "Standardmängel-Katalog", status: "ok", text: `${s.mangelvorlagen} Vorlagen vorhanden.`, link: "/einstellungen" }
          : { schluessel: "maengel", titel: "Standardmängel-Katalog", status: "warnung", text: "Noch kein Katalog – Standardkatalog übernehmen und anpassen.", link: "/einstellungen" },
      ],
    },
    {
      titel: "3. Geschäftspartner",
      punkte: [
        p.gesamt
          ? { schluessel: "partner", titel: "Geschäftspartner übernommen", status: "ok", text: `${p.gesamt} Partner, davon ${p.handwerker} Handwerker und ${p.kaeufer} Käufer.`, link: "/partner" }
          : { schluessel: "partner", titel: "Geschäftspartner übernommen", status: "fehlt", text: "Noch keine Geschäftspartner – per Datenimport aus Excel/CSV übernehmen.", link: "/einstellungen/import" },
        p.handwerkerOhneIban
          ? { schluessel: "hw-iban", titel: "Handwerker mit IBAN", status: "warnung", text: `${p.handwerkerOhneIban} Handwerker ohne IBAN – nicht im Zahlungslauf zahlbar.`, link: "/partner?rolle=handwerker" }
          : { schluessel: "hw-iban", titel: "Handwerker mit IBAN", status: p.handwerker ? "ok" : "info", text: p.handwerker ? "Alle Handwerker haben eine IBAN." : "Noch keine Handwerker angelegt.", link: "/partner?rolle=handwerker" },
        p.handwerkerOhneFreistellung
          ? { schluessel: "hw-freistellung", titel: "Freistellungsbescheinigungen (§ 48b EStG)", status: "warnung", text: `${p.handwerkerOhneFreistellung} Handwerker ohne gültige Freistellung – bei Zahlung werden 15 % Bauabzugsteuer einbehalten.`, link: "/partner?rolle=handwerker" }
          : { schluessel: "hw-freistellung", titel: "Freistellungsbescheinigungen (§ 48b EStG)", status: p.handwerker ? "ok" : "info", text: p.handwerker ? "Alle Handwerker mit gültiger Freistellung." : "Noch keine Handwerker angelegt.", link: "/partner?rolle=handwerker" },
        p.kaeuferOhneAnschrift || p.kaeuferOhneEmail
          ? { schluessel: "kaeufer", titel: "Käufer: Anschrift und E-Mail", status: "warnung", text: [p.kaeuferOhneAnschrift && `${p.kaeuferOhneAnschrift} ohne Anschrift`, p.kaeuferOhneEmail && `${p.kaeuferOhneEmail} ohne E-Mail (kein Versand, kein Käuferportal-Link per Mail)`].filter(Boolean).join(", ") + ".", link: "/partner?rolle=kunde" }
          : { schluessel: "kaeufer", titel: "Käufer: Anschrift und E-Mail", status: p.kaeufer ? "ok" : "info", text: p.kaeufer ? "Alle Käufer vollständig." : "Noch keine Käufer angelegt.", link: "/partner?rolle=kunde" },
      ],
    },
    {
      titel: "4. Projekte und Einheiten",
      punkte: [
        s.projekte.length
          ? { schluessel: "projekte", titel: "Projekte und Einheiten", status: s.projekte.some((x) => !x.einheiten) ? "warnung" : "ok", text: s.projekte.some((x) => !x.einheiten) ? `Ohne Einheiten: ${liste(s.projekte.filter((x) => !x.einheiten).map((x) => `${x.nr} ${x.suchcode}`))}.` : `${s.projekte.length} Projekt(e) mit ${s.projekte.reduce((a, x) => a + x.einheiten, 0)} Einheiten.`, link: "/projekte" }
          : { schluessel: "projekte", titel: "Projekte und Einheiten", status: "fehlt", text: "Noch keine Projekte angelegt.", link: "/projekte" },
        meaFalsch.length
          ? { schluessel: "mea", titel: "Miteigentumsanteile = 1.000 ‰", status: "warnung", text: `Summe weicht ab: ${liste(meaFalsch.map((x) => `${x.nr} ${x.suchcode} (${Number(x.meaSumme).toLocaleString("de-DE")} ‰)`))}.`, link: `/projekte/${meaFalsch[0]!.id}` }
          : { schluessel: "mea", titel: "Miteigentumsanteile = 1.000 ‰", status: s.projekte.some((x) => x.einheiten) ? "ok" : "info", text: s.projekte.some((x) => x.einheiten) ? "Bei allen Projekten mit Einheiten stimmt die Summe." : "Noch keine Einheiten erfasst.", link: "/projekte" },
      ],
    },
    {
      titel: "5. Laufende Vorgänge",
      punkte: [
        { schluessel: "kaufvertraege", titel: "Kaufverträge mit Ratenplan", status: s.vorgaenge.kaufvertraege ? "ok" : "info", text: s.vorgaenge.kaufvertraege ? `${s.vorgaenge.kaufvertraege} Kaufverträge erfasst – angeforderte und gezahlte Raten nachtragen.` : "Noch keine Kaufverträge erfasst.", link: "/verkauf" },
        { schluessel: "handwerkervertraege", titel: "Handwerkerverträge und offene Rechnungen", status: s.vorgaenge.handwerkervertraege ? "ok" : "info", text: s.vorgaenge.handwerkervertraege ? `${s.vorgaenge.handwerkervertraege} Handwerkerverträge erfasst.` : "Noch keine Handwerkerverträge erfasst.", link: "/kosten" },
        { schluessel: "buergschaften", titel: "Bürgschaften", status: s.vorgaenge.buergschaften ? "ok" : "info", text: s.vorgaenge.buergschaften ? `${s.vorgaenge.buergschaften} Bürgschaften erfasst.` : "Noch keine Bürgschaften erfasst (falls vorhanden: erhaltene und § 7 MaBV).", link: "/buergschaften" },
      ],
    },
    {
      titel: "6. Abgleich vor dem Echtbetrieb",
      punkte: [
        proGesellschaft("kontierung", "Kontenzuordnung mit Steuerberater abgestimmt", (x) => x.kontierungEingestellt, "Bei allen Gesellschaften eingestellt.", "Noch Standardkonten bei", "warnung"),
        proGesellschaft("datev-test", "DATEV-Export getestet", (x) => x.datevExporte > 0, "Bei allen Gesellschaften mindestens ein Export.", "Noch kein Export bei", "warnung"),
        proGesellschaft("bankabgleich", "Kontoauszug im Bankabgleich eingelesen", (x) => x.bankimporte > 0, "Bei allen Gesellschaften mindestens ein Auszug.", "Noch kein Auszug bei", "warnung"),
        { schluessel: "saldenliste", titel: "Offene Posten = Debitorensaldo laut DATEV", status: "info", text: "Saldenliste aus DATEV zum Stichtag hochladen und Abweichungen klären.", link: "/buchhaltung/saldenliste" },
        { schluessel: "mabv", titel: "MaBV-Prüfbericht ohne unerklärte Feststellungen", status: "info", text: "Prüfbericht für das Vorjahr durchsehen.", link: "/auswertungen/mabv-pruefbericht" },
      ],
    },
  ];
  // proGesellschaft-Links bei Punkt „kontierung“, „datev-test“, „bankabgleich“ auf die Fachseiten umlenken
  for (const pt of gruppen[5]!.punkte) {
    const ges = pt.link?.match(/^\/gesellschaften\/(.+)$/)?.[1];
    if (pt.schluessel === "kontierung" || pt.schluessel === "datev-test") pt.link = ges ? `/buchhaltung?g=${ges}` : "/buchhaltung";
    if (pt.schluessel === "bankabgleich") pt.link = ges ? `/bankabgleich?g=${ges}` : "/bankabgleich";
  }
  const alle = gruppen.flatMap((x) => x.punkte).filter((x) => x.status !== "info");
  const ok = alle.filter((x) => x.status === "ok").length;
  return { gruppen, fortschritt: { ok, gesamt: alle.length, prozent: alle.length ? Math.round((ok / alle.length) * 100) : 0 } };
}
