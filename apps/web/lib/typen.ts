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
