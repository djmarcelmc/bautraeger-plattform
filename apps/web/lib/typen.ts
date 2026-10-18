export interface Gesellschaft {
  id: string;
  nr: number;
  name: string;
  anschrift: string | null;
  datevBeraternr: number | null;
  datevMandantennr: number | null;
  skr: string | null;
  sachkontenlaenge: number | null;
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
  rollen: string[];
  freistellungGueltigBis: string | null;
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
  verzugszinsProzent: string | null;
  anforderungssperre: boolean;
  mahnsperre: boolean;
  projekt: { id: string; nr: number; suchcode: string; strasse: string | null; plz: string | null; ort: string | null };
  gesellschaft: { id: string; nr: number; name: string; anschrift: string | null };
  kaeufer: (Partner & { anteilProzent: string })[];
  einheiten: { id: string; nr: string; typ: string; art: string | null; wohnflaeche: string | null; vkBrutto: string }[];
  raten: Rate[];
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
  summen: { vertragssumme: string; angefordert: string; bezahlt: string; offen: string; nichtAngefordert: string };
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
