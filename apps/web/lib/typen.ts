export interface Gesellschaft {
  id: string;
  nr: number;
  name: string;
  anschrift: string | null;
  datevBeraternr: number | null;
  datevMandantennr: number | null;
  skr: string | null;
  sachkontenlaenge: number | null;
  iban: string | null;
  bic: string | null;
  steuernummer: string | null;
}

export interface Partner {
  id: string;
  nr: number;
  suchcode: string;
  firma: string | null;
  anrede: string | null;
  vorname: string | null;
  nachname: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  email: string | null;
  telefon: string | null;
  iban: string | null;
  bic: string | null;
  rollen: string[];
  freistellungGueltigBis: string | null;
  steuernummer: string | null;
  finanzamt: string | null;
  debitorKonto: string | null;
  kreditorKonto: string | null;
}

export interface ProjektListe {
  id: string;
  nr: number;
  suchcode: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  art: string;
  abgeschlossen: boolean;
  gesellschaftNr: number;
  gesellschaft: string;
  einheiten: number;
}

export interface Projekt {
  id: string;
  gesellschaftId: string;
  nr: number;
  suchcode: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  art: string;
  para13bAnwendbar: boolean;
  grundbuchamt: string | null;
  grundbuchBlatt: string | null;
  flurstueck: string | null;
  kostenstelle: string | null;
  projektbeginn: string | null;
  baubeginnSoll: string | null;
  baubeginnIst: string | null;
  fertigstellungSoll: string | null;
  fertigstellungIst: string | null;
  abgeschlossen: boolean;
}

export interface EinheitKurz {
  id: string;
  nr: string;
  typ: string;
  bauabschnitt: number | null;
  etage: string | null;
  art: string | null;
  wohnflaeche: string | null;
  vkBrutto: string | null;
  zugehoerigZuEinheitId: string | null;
  verkauft: boolean;
}

export interface ProjektDetail extends Projekt {
  gesellschaft: { id: string; nr: number; name: string };
  einheiten: EinheitKurz[];
  uebersicht: Record<string, { anzahl: number; verkauft: number }>;
}

export interface Einheit {
  id: string;
  projektId: string;
  nr: string;
  typ: string;
  bauabschnitt: number | null;
  etage: string | null;
  art: string | null;
  wohnflaeche: string | null;
  miteigentumTsd: string | null;
  preisProM2: string | null;
  vkBrutto: string | null;
  mindestVk: string | null;
  zugehoerigZuEinheitId: string | null;
  projekt: { id: string; nr: number; suchcode: string };
}

export interface ProtokollEintrag {
  id: string;
  zeitpunkt: string;
  aktion: string;
  benutzer: string;
  alt: unknown;
  neu: unknown;
}

export const partnerName = (p: Pick<Partner, "firma" | "vorname" | "nachname">) =>
  p.firma ?? [p.vorname, p.nachname].filter(Boolean).join(" ");

// ---------------------------------------------------------------- Verkauf

export interface KaufvertragListe {
  id: string;
  nr: string;
  datum: string | null;
  urkundennr: string | null;
  projektId: string;
  projektNr: number;
  projekt: string;
  kaeufer: string | null;
  einheiten: string | null;
  vertragssumme: string;
  angefordert: string;
  bezahlt: string;
}

export interface Rate {
  id: string;
  nr: number;
  typ: string;
  abschnitte: string[];
  prozent: string | null;
  betrag: string;
  text: string | null;
  zahlungsanforderungId: string | null;
  bezahlt: string;
  status: "offen" | "anforderbar" | "gesperrt" | "angefordert" | "teilbezahlt" | "bezahlt";
  rechnungsnr: string | null;
  faelligAm: string | null;
}

export interface Anforderung {
  id: string;
  rechnungsnr: string;
  angefordertAm: string;
  faelligAm: string;
  betrag: string;
  bezahlt: string;
  offen: string;
  ueberfaellig: boolean;
  mahnstufe: number;
  raten: number[];
  mahnungen: Mahnung[];
}

export interface VertragDetail {
  id: string;
  nr: string;
  urkundennr: string | null;
  datum: string | null;
  erbbaurecht: boolean;
  zahlungsanforderungAn: string | null;
  vertragWirksam: boolean;
  vormerkungEingetragenAm: string | null;
  lastenfreistellungGesichert: boolean;
  buergschaftNach7: boolean;
  zahlungszielTage: number;
  verbraucher: boolean;
  verzugszinsProzent: string | null;
  anforderungssperre: boolean;
  mahnsperre: boolean;
  projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { id: string; nr: number; name: string; anschrift: string | null };
  kaeufer: (Partner & { anteilProzent: string })[];
  einheiten: { id: string; nr: string; typ: string; art: string | null; wohnflaeche: string | null; vkBrutto: string }[];
  raten: Rate[];
  sonderwuensche: Sonderwunsch[];
  anforderungen: Anforderung[];
  eingaenge: { id: string; zahlungsanforderungId: string | null; datum: string; betrag: string; verwendungszweck: string | null }[];
  fertigeAbschnitte: string[];
  voraussetzungen: {
    vertragWirksam: boolean;
    vormerkungEingetragen: boolean;
    lastenfreistellungGesichert: boolean;
    buergschaftNach7: boolean;
    erfuellt: boolean;
    anforderungssperre: boolean;
  };
  summen: { vertragssumme: string; sonderwuensche: string; gesamt: string; angefordert: string; bezahlt: string; offen: string; nichtAngefordert: string };
}

export interface Sonderwunsch {
  id: string;
  kaufvertragId: string;
  nr: number;
  art: "zusatzleistung" | "gutschrift";
  bezeichnung: string;
  beschreibung: string | null;
  betragBrutto: string;
  kostenBrutto: string | null;
  gewerkId: string | null;
  abschnitt: string | null;
  status: "angebot" | "beauftragt" | "abgelehnt";
  angebotAm: string | null;
  gueltigBis: string | null;
  entschiedenAm: string | null;
  rateId: string | null;
}

export interface OffenerPosten {
  id: string;
  rechnungsnr: string;
  angefordertAm: string;
  faelligAm: string;
  betrag: string;
  bezahlt: string;
  offen: string;
  mahnstufe: number;
  kaufvertragId: string;
  kaufvertrag: string;
  projektId: string;
  projektNr: number;
  projekt: string;
  empfaenger: string | null;
  tageUeberfaellig: number;
}

// ---------------------------------------------------------------- Kosten

export interface Kostenstand {
  geschaetzt: string;
  vergeben: string;
  nachtraege: string;
  summeVergeben: string;
  berechnet: string;
  bezahlt: string;
  trend: string;
  abweichung: string;
}

export interface GewerkZeile {
  id: string;
  nr: number;
  gruppe: string | null;
  bezeichnung: string;
  geschaetztBrutto: string;
  stand: Kostenstand;
  vertraege: {
    id: string;
    nrIntern: string | null;
    vertragBrutto: string;
    handwerker: { id: string; suchcode: string; firma: string | null; nachname: string | null } | null;
    offeneRechnungen: number;
  }[];
}

export interface Kostenkontrolle {
  gewerke: GewerkZeile[];
  summe: Kostenstand;
}

export interface Rechnung {
  id: string;
  rechnungsnr: string;
  rechnungsdatum: string;
  eingangAm: string;
  schlussrechnung: boolean;
  betragBrutto: string;
  geprueftKumuliert: string | null;
  status: "erfasst" | "sachlich_geprueft" | "rechnerisch_geprueft" | "freigegeben" | "bezahlt";
  bemerkung: string | null;
  geprueftAm: string | null;
  geprueftVon: string | null;
  freigegebenAm: string | null;
  freigegebenVon: string | null;
  pruefergebnis: Record<string, string> | null;
}

export interface Handwerkervertrag {
  id: string;
  gewerkId: string;
  handwerkerId: string | null;
  nrIntern: string | null;
  angebotVom: string | null;
  vertragVom: string | null;
  vertragBrutto: string;
  nachlassProzent: string | null;
  skontoProzent: string | null;
  skontoFristTage: number | null;
  zahlungsfristTage: number | null;
  umlagen: Record<string, string | null> | null;
  einbehaltVertragserfuellungProzent: string | null;
  einbehaltGewaehrleistungProzent: string | null;
  gewaehrleistungMonate: number | null;
  abnahmeAm: string | null;
  gewerk: { id: string; nr: number; bezeichnung: string; gruppe: string | null };
  projekt: { id: string; nr: number; suchcode: string };
  handwerker: Partner | null;
  nachtraege: { id: string; nr: number; text: string; betragBrutto: string; status: string }[];
  rechnungen: Rechnung[];
  zahlungen: { id: string; eingangsrechnungId: string; datum: string; betrag: string; skonto: string; bauabzugsteuer: string; rechnungsnr: string }[];
  maengel: { offen: number; einbehalt: string };
  summen: {
    vertrag: string;
    nachtraege: string;
    auftrag: string;
    berechnet: string;
    abgegolten: string;
    ausgezahlt: string;
    skonto: string;
    bauabzugsteuer: string;
    restBerechnet: string;
  };
}

export interface RechnungDetail extends Rechnung {
  handwerkervertragId: string;
  vertrag: {
    id: string;
    nrIntern: string | null;
    projekt: { id: string; nr: number; suchcode: string };
    gewerk: { id: string; nr: number; bezeichnung: string };
    handwerker: Partner | null;
    skontoProzent: string | null;
    zahlungsfristTage: number | null;
  };
  zahlung: { datum: string; betrag: string; skonto: string; bauabzugsteuer: string } | null;
  maengel: { offen: number; einbehalt: string };
  vorschau: {
    zahlungsdatum: string;
    skontoFristBis: string | null;
    skontoMoeglich: boolean;
    freistellungGueltig: boolean;
    einbehaltProzent: number;
    umlagenProzent: number;
    nachlassProzent: number;
    ohneSkonto: Record<string, string>;
    mitSkonto: Record<string, string>;
  };
  faelligAm: string | null;
}

export interface RechnungsbuchZeile {
  id: string;
  rechnungsnr: string;
  rechnungsdatum: string;
  eingangAm: string;
  schlussrechnung: boolean;
  betragBrutto: string;
  geprueftKumuliert: string | null;
  status: Rechnung["status"];
  auszahlung: string | null;
  vertragId: string;
  gewerkNr: number;
  gewerk: string;
  projektId: string;
  projektNr: number;
  projekt: string;
  handwerker: string | null;
}

// ---------------------------------------------------------------- Mängel

export type MangelStatusTyp = "neu" | "frist_laeuft" | "ueberfaellig" | "erledigt";

export interface MangelListe {
  id: string;
  nr: number;
  titel: string;
  ort: string | null;
  mangelart: string | null;
  eigentum: "sonder" | "gemeinschaft";
  festgestelltAm: string;
  erledigtAm: string | null;
  einbehalt: boolean;
  wertHandwerkerBrutto: string | null;
  projektId: string;
  projektNr: number;
  projekt: string;
  einheit: string | null;
  gewerk: string | null;
  handwerker: string | null;
  fotos: number;
  status: MangelStatusTyp;
  ruegen: number;
  fristBis: string | null;
}

export interface Ruege {
  id: string;
  stufe: number;
  geruegtAm: string;
  fristBis: string;
  nachfristBis: string | null;
  bemerkung: string | null;
}

export interface MangelDetail {
  id: string;
  projektId: string;
  nr: number;
  einheitId: string | null;
  gewerkId: string | null;
  handwerkervertragId: string | null;
  handwerkerId: string | null;
  kaufvertragId: string | null;
  eigentum: "sonder" | "gemeinschaft";
  festgestelltAm: string;
  festgestelltDurch: string | null;
  titel: string;
  ort: string | null;
  beschreibung: string | null;
  mangelart: string | null;
  wertHandwerkerBrutto: string | null;
  wertKundeBrutto: string | null;
  einbehalt: boolean;
  angebotsanforderungAm: string | null;
  auftragserteilungAm: string | null;
  ersatzvornahmeAm: string | null;
  erledigtAm: string | null;
  erledigtVon: string | null;
  projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { id: string; name: string; anschrift: string | null };
  einheit: { id: string; nr: string; typ: string } | null;
  gewerk: { id: string; nr: number; bezeichnung: string } | null;
  vertrag: { id: string; nrIntern: string | null; abnahmeAm: string | null; gewaehrleistungMonate: number | null; gewaehrleistungBis: string | null } | null;
  handwerker: Partner | null;
  kaufvertrag: { id: string; nr: string } | null;
  ruegen: Ruege[];
  status: MangelStatusTyp;
  gewaehrleistungAbgelaufen: boolean | null;
  naechsteRuege: { stufe: number; fristBis: string } | null;
}

export interface DokumentInfo {
  id: string;
  dateiname: string;
  mimeType: string | null;
  groesse: number | null;
  beschreibung: string | null;
  hochgeladenVon: string | null;
  angelegtAm: string;
}

// ---------------------------------------------------------------- Mahnwesen

export interface Mahnung {
  id: string;
  zahlungsanforderungId: string;
  stufe: number;
  datum: string;
  fristBis: string;
  offenerBetrag: string;
  verzugszinsen: string;
  mahngebuehr: string;
  erstelltVon: string | null;
}

export interface MahnPosten {
  id: string;
  rechnungsnr: string;
  angefordertAm: string;
  faelligAm: string;
  betrag: string;
  offen: string;
  tageUeberfaellig: number;
  mahnstufe: number;
  letzteMahnung: Mahnung | null;
  mahnungen: Mahnung[];
  verzugszinsen: string;
  zinsHinweis?: string;
  vorschlag: { stufe: number | null; hinweis?: string };
  vertrag: { id: string; nr: string; mahnsperre: boolean; verbraucher: boolean };
  projekt: { id: string; nr: number; suchcode: string };
  empfaenger: string | null;
}

export interface MahnungDruck extends Mahnung {
  titel: string;
  anforderung: { id: string; rechnungsnr: string; angefordertAm: string; faelligAm: string; betrag: string; raten: number[] };
  zahlungen: { datum: string; betrag: string }[];
  zinsperioden: { von: string; bis: string; tage: number; kapital: string; zinssatz: string; zinsen: string }[];
  vertrag: { id: string; nr: string; urkundennr: string | null; datum: string | null; einheiten: { nr: string; typ: string }[]; verbraucher: boolean; verzugszinsProzent: string | null };
  projekt: { suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { id: string; name: string; anschrift: string | null };
  empfaenger: Partner;
  kaeufer: Partner[];
  vorherige: Mahnung[];
}

export interface Vorgang {
  id: string;
  projektId: string;
  nr: number;
  bezeichnung: string;
  gewerkIds: string[];
  mabvAbschnitt: string | null;
  beginn: string;
  ende: string;
  endeIst: string | null;
  gewerke: { id: string; nr: number; bezeichnung: string; trend: string; berechnet: string }[];
  meilenstein: string | null;
  gemeldet: number | null;
  kritisch: boolean;
  vorgaenger: { id: string; nr: number; abstandTage: number }[];
}

export interface Bauzeitenplan {
  vorgaenge: Vorgang[];
  einheiten: number;
  beginn: string | null;
  ende: string | null;
  gewerkeOhneVorgang: { id: string; nr: number; bezeichnung: string; trend: string }[];
}

export interface LiquiditaetsWoche {
  jahr: number;
  woche: number;
  von: string;
  bis: string;
  ein: Record<string, string>;
  aus: Record<string, string>;
  einSumme: string;
  ausSumme: string;
  saldo: string;
  bestand: string;
}

export interface Liquiditaetsplan {
  stichtag: string;
  projekte: { id: string; nr: number; suchcode: string; gesellschaft: string; hatPlan: boolean }[];
  artText: { ein: Record<string, string>; aus: Record<string, string> };
  anfangsbestand: string;
  arten: { ein: string[]; aus: string[] };
  wochen: LiquiditaetsWoche[];
  summe: { ein: string; aus: string; endbestand: string };
  tiefstand: { bestand: string; woche: { jahr: number; woche: number } | null };
  ueberfaellig: { ein: string; aus: string };
  spaeter: { ein: string; aus: string };
  ohneTermin: { ein: string; aus: string };
  skonto: boolean;
  einbehalte: { skontoErsparnis: string; einbehaltenBisher: string; gewaehrleistung: string };
}

export interface ZahlungsvorschlagRechnung {
  id: string;
  rechnungsnr: string;
  rechnungsdatum: string;
  projekt: { id: string; nr: number; suchcode: string };
  gewerk: string;
  handwerker: { name: string; iban: string | null };
  faelligAm: string | null;
  skontoFristBis: string | null;
  skontoMoeglich: boolean;
  auszahlung: string;
  skonto: string;
  bauabzugsteuer: string;
  zahlbar: boolean;
  hinweise: string[];
}

export interface Zahlungsvorschlag {
  ausfuehrungAm: string;
  gesellschaften: { gesellschaft: { id: string; nr: number; name: string; iban: string | null; kontoOk: boolean }; rechnungen: ZahlungsvorschlagRechnung[]; summe: string }[];
}

export interface ZahlungslaufListe {
  id: string;
  nr: string;
  ausfuehrungAm: string;
  anzahl: number;
  summe: string;
  erstelltVon: string | null;
  angelegtAm: string;
  gesellschaft: string;
}

export interface ZahlungslaufDetail extends Omit<ZahlungslaufListe, "gesellschaft"> {
  gesellschaft: { id: string; name: string; iban: string | null; bic: string | null };
  zahlungen: { rechnungId: string; rechnungsnr: string; betrag: string; skonto: string; bauabzugsteuer: string; projekt: string; gewerk: string; handwerker: string; iban: string | null }[];
  bauabzugsteuer: { summe: string; faelligAm: string | null };
  skonto: string;
}

export interface Buergschaft {
  id: string;
  richtung: "erhalten" | "ausgegeben";
  art: string;
  artText: string;
  handwerkervertragId: string | null;
  kaufvertragId: string | null;
  buergeId: string | null;
  nr: string | null;
  betrag: string;
  ausgestelltAm: string | null;
  gueltigBis: string | null;
  rueckgabeAm: string | null;
  bemerkung: string | null;
  projekt: { id: string; nr: number; suchcode: string } | null;
  bezug: string;
  buerge: string | null;
  rueckgabeFaelligAb: string | null;
  status: "zurueckgegeben" | "abgelaufen" | "rueckgabe_faellig" | "laeuft_ab" | "aktiv";
}

export interface BuergschaftListe {
  buergschaften: Buergschaft[];
  summen: { erhalten: string; ausgegeben: string; handlungsbedarf: number };
}

export interface AbnahmeListe {
  id: string;
  nr: number;
  art: string;
  artText: string;
  datum: string;
  ergebnis: string | null;
  abgeschlossenAm: string | null;
  projektId: string;
  projekt: string;
  bezug: string | null;
  einheit: string | null;
  maengel: number;
  maengelOffen: number;
}

export interface AbnahmeDetail {
  id: string;
  nr: number;
  art: "sondereigentum" | "gemeinschaftseigentum" | "handwerker";
  artText: string;
  datum: string;
  ort: string | null;
  teilnehmer: string | null;
  bemerkung: string | null;
  schluessel: string | null;
  zaehler: Record<string, string | null>;
  kaufvertragId: string | null;
  einheitId: string | null;
  handwerkervertragId: string | null;
  ergebnis: "abgenommen" | "vorbehalt" | "verweigert" | null;
  vorbehaltVertragsstrafe: boolean;
  gewaehrleistungMonate: number | null;
  abgeschlossenAm: string | null;
  abgeschlossenVon: string | null;
  projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { id: string; name: string; anschrift: string | null };
  kaufvertrag: { id: string; nr: string; urkundennr: string | null; kaeufer: Partner[]; einheiten: { id: string; nr: string; typ: string }[]; uebergabeIst: string | null; gewaehrleistungBis: string | null } | null;
  handwerkervertrag: { id: string; nrIntern: string | null; gewerk: string; handwerker: Partner | null } | null;
  einheit: { id: string; nr: string; typ: string; art: string | null; etage: string | null } | null;
  maengel: { id: string; nr: number; titel: string; ort: string | null; beschreibung: string | null; gewerk: string | null; handwerker: string | null; erledigtAm: string | null; status: string }[];
}

export interface Mangelvorlage {
  id: string;
  kategorie: string;
  gewerkNr: number | null;
  titel: string;
  beschreibung: string | null;
}

export interface MabvFeststellung {
  art: "ratenplan" | "bautenstand" | "voraussetzung" | "sicherheit";
  schwere: "verstoss" | "hinweis";
  text: string;
  rechnungsnr?: string;
}

export interface MabvPruefbericht {
  gesellschaft: { id: string; nr: number; name: string; anschrift: string | null };
  gesellschaften: { id: string; nr: number; name: string }[];
  zeitraum: { von: string; bis: string };
  erstelltAm: string;
  vertraege: {
    id: string;
    nr: string;
    urkundennr: string | null;
    datum: string | null;
    projekt: { id: string; nr: number; suchcode: string };
    kaeufer: string[];
    einheiten: string[];
    sicherung: {
      art: "§ 3" | "§ 7";
      vertragWirksam: boolean;
      vormerkungEingetragenAm: string | null;
      lastenfreistellungGesichert: boolean;
      buergschaften: { nr: string | null; betrag: string; ausgestelltAm: string | null; gueltigBis: string | null; rueckgabeAm: string | null; buerge: string | null }[];
    };
    vertragssumme: string;
    anforderungen: {
      id: string;
      rechnungsnr: string;
      angefordertAm: string;
      faelligAm: string;
      betrag: string;
      kumuliert: string;
      ordnungsgemaess: boolean | null;
      raten: { nr: number; typ: string; prozent: string | null; betrag: string; abschnitte: { key: string; text: string; fertigAm: string | null; rechtzeitig: boolean }[] }[];
      feststellungen: MabvFeststellung[];
    }[];
    eingaenge: { datum: string; betrag: string; verwendungszweck: string | null }[];
    summen: { angefordertImZeitraum: string; eingegangenImZeitraum: string; angefordertBisEnde: string; eingegangenBisEnde: string };
    feststellungen: MabvFeststellung[];
    verstoesse: number;
  }[];
  summen: { vertraege: number; vertragssumme: string; angefordertImZeitraum: string; eingegangenImZeitraum: string; anforderungen: number; verstoesse: number; hinweise: number; mitParagraph7: number };
}

export interface CockpitAufgabe {
  bereich: "verkauf" | "kosten" | "maengel" | "sicherheiten" | "bau" | "steuern" | "einstellungen";
  dringlichkeit: "hoch" | "mittel" | "info";
  titel: string;
  text: string;
  datum?: string | null;
  betrag?: string | null;
  projekt?: string | null;
  link: string;
}

export interface Cockpit {
  stichtag: string;
  aufgaben: CockpitAufgabe[];
  anzahl: { hoch: number; mittel: number; info: number };
  kennzahlen: { projekte: number; offeneForderungen: string; ueberfaellig: string; zuZahlen: string; offeneMaengel: number };
}
