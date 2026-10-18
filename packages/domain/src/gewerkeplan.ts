/**
 * Standard-Gewerkeplan als Vorlage für neue Projekte (Gewerkegruppen in Anlehnung an DIN 276).
 * Übernommen aus der Altsoftware („Übernahme von ALTENBURG“); Anteile in % der Gesamtkosten, je Projekt anpassbar.
 */
export interface GewerkVorlage {
  nr: number;
  gruppe: string;
  bezeichnung: string;
  anteilProzent: number;
}

const g = (gruppe: string, liste: [number, string, number][]): GewerkVorlage[] =>
  liste.map(([nr, bezeichnung, anteilProzent]) => ({ nr, gruppe, bezeichnung, anteilProzent }));

export const STANDARD_GEWERKEPLAN: readonly GewerkVorlage[] = [
  ...g("100 Grundstück", [[100, "Grundstück", 19.28]]),
  ...g("120 Grundstücksnebenkosten", [
    [122, "Grundbuchamt", 0.19],
    [123, "Notargebühren", 0.1],
    [124, "Maklercourtage", 0.69],
    [125, "Grunderwerbsteuer", 0.96],
    [127, "Behördengebühren", 0.53],
  ]),
  ...g("200 Herrichten und Erschließen", [
    [135, "Herrichten u. Erschließung", 0.19],
    [212, "Abbruch/Rodung", 1.56],
  ]),
  ...g("220 Öffentliche Erschließung", [
    [222, "Wasseranschluss", 0.05],
    [223, "Gasanschluss", 0],
    [224, "Fernwärmeversorgung", 0.19],
    [225, "Elektroanschluss", 0.04],
    [226, "Telekom und Kabel", 0.03],
    [227, "Verkehrsanlagen", 0.02],
    [228, "Sonstiges", 0.02],
  ]),
  ...g("230 Nicht öffentliche Erschließung", [
    [231, "Abwasser, Kanalisation", 0.08],
    [232, "Wasserversorgung", 0.05],
    [234, "Elektrische Stromversorgung", 0.16],
    [235, "Telekom/Kabel", 0.04],
    [237, "Beleuchtung", 0.02],
  ]),
  ...g("300 Bauwerk – Baukonstruktion", [[300, "Rohbau", 12.33]]),
  ...g("310 Baugrube", [[311, "Erdarbeiten", 3.09]]),
  ...g("320 Gründung", [[326, "Abdichtung", 0.73]]),
  ...g("330 Außenwände", [
    [333, "Garagentor", 0.05],
    [334, "Fenster u. Rollläden", 4.75],
    [335, "Putzarbeiten außen", 2.14],
    [336, "Putzarbeiten innen", 1.12],
    [337, "Maler", 1.26],
    [339, "Schlosser", 1.1],
  ]),
  ...g("340 Innenwände", [
    [340, "Trockenausbau", 1.92],
    [344, "Türen/Schreiner", 0.71],
  ]),
  ...g("350 Decken, Treppen", [
    [350, "Innentreppen", 0.23],
    [351, "Werksteinarbeiten/Treppen", 0.45],
    [352, "Estrich", 0.82],
    [353, "Balkonbelag", 0.25],
    [354, "Bodenbeläge", 1.86],
    [355, "Fliesenarbeiten", 1.28],
  ]),
  ...g("360 Dächer", [
    [361, "Zimmerarbeiten", 2.27],
    [363, "Dachdecker", 0.84],
    [369, "Flaschner", 0.84],
    [392, "Gerüste", 0.34],
  ]),
  ...g("390 Sonstige Maßnahmen Baukonstruktion", [[397, "Gebäudereinigung u. Entsorgung", 0.17]]),
  ...g("400 Technische Anlagen", [
    [400, "Elektroinstallation", 4.47],
    [461, "Aufzüge", 0.76],
    [463, "Parksystem", 0.35],
  ]),
  ...g("420 Wärmeversorgungsanlagen", [
    [420, "Heizungsinstallation", 1.91],
    [421, "Sanitärinstallation", 4.11],
  ]),
  ...g("500 Außenanlagen", [[511, "Außenanlage", 4.99]]),
  ...g("730 Architekten- u. Ingenieurleistungen", [
    [730, "Architekt", 5.59],
    [735, "Statik", 0.43],
    [736, "Fachingenieur Elektro", 0.06],
    [737, "Fachingenieur HLS", 0.37],
  ]),
  ...g("740 Gutachten u. Beratung", [
    [742, "Bauphysik", 0.05],
    [743, "Geologe", 0.04],
    [744, "Vermessung", 0.14],
    [747, "SiGeKo", 0.03],
    [749, "Baucontrolling", 0.06],
  ]),
  ...g("760 Finanzierung", [[761, "Bauzeitzinsen", 6.27]]),
  ...g("770 Allgemeine Baunebenkosten", [
    [771, "Prüfstatik", 0.08],
    [787, "Verkaufsförderung", 0.05],
    [788, "Versicherungen", 0.02],
  ]),
  ...g("790 Sonstige Baunebenkosten", [
    [791, "Vertriebsprovisionen", 4.75],
    [792, "Inserate u. Internet", 0.05],
    [794, "Regiekosten", 2.41],
    [795, "Rechts- und Beratungskosten", 0.24],
  ]),
];
