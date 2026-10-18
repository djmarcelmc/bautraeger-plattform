import { describe, expect, it } from "vitest";
import { inbetriebnahmePruefen, type InbetriebnahmeStand } from "./inbetriebnahme.js";

const ges = { id: "g1", nr: 1, name: "Muster Wohnbau", anschrift: true, steuernummer: true, datev: true, iban: true, briefbogen: true, kontierungEingestellt: true, datevExporte: 1, bankimporte: 1 };
const fertig: InbetriebnahmeStand = {
  system: { anmeldungAktiv: true, mailVersand: "microsoft365", rechnungspostfach: "rechnungen@x.de" },
  gesellschaften: [ges],
  basiszinsFehlt: null,
  mangelvorlagen: 40,
  partner: { gesamt: 20, handwerker: 8, handwerkerOhneIban: 0, handwerkerOhneFreistellung: 0, kaeufer: 10, kaeuferOhneAnschrift: 0, kaeuferOhneEmail: 0 },
  projekte: [{ id: "p1", nr: 101, suchcode: "LINDENWEG", einheiten: 12, meaSumme: "1000.000" }],
  vorgaenge: { kaufvertraege: 5, handwerkervertraege: 8, buergschaften: 2 },
};
const punkt = (s: InbetriebnahmeStand, k: string) => inbetriebnahmePruefen(s).gruppen.flatMap((g) => g.punkte).find((p) => p.schluessel === k)!;

describe("inbetriebnahmePruefen", () => {
  it("vollständiger Stand: alles grün, Info-Punkte zählen nicht", () => {
    const r = inbetriebnahmePruefen(fertig);
    expect(r.fortschritt.prozent).toBe(100);
    expect(r.gruppen.flatMap((g) => g.punkte).filter((p) => p.status !== "ok" && p.status !== "info")).toEqual([]);
  });
  it("leere Plattform: fehlende Grundlagen", () => {
    const leer: InbetriebnahmeStand = { ...fertig, system: { anmeldungAktiv: false, mailVersand: "protokoll", rechnungspostfach: null }, gesellschaften: [], basiszinsFehlt: "2026-07-01", mangelvorlagen: 0, partner: { gesamt: 0, handwerker: 0, handwerkerOhneIban: 0, handwerkerOhneFreistellung: 0, kaeufer: 0, kaeuferOhneAnschrift: 0, kaeuferOhneEmail: 0 }, projekte: [], vorgaenge: { kaufvertraege: 0, handwerkervertraege: 0, buergschaften: 0 } };
    const r = inbetriebnahmePruefen(leer);
    expect(r.fortschritt.ok).toBe(0);
    expect(punkt(leer, "datev")).toMatchObject({ status: "fehlt", text: "Noch keine Gesellschaft angelegt.", link: "/gesellschaften" });
    expect(punkt(leer, "basiszins").text).toMatch(/01\.07\.2026/);
    expect(punkt(leer, "partner")).toMatchObject({ status: "fehlt", link: "/einstellungen/import" });
  });
  it("nennt betroffene Gesellschaften und verlinkt direkt", () => {
    const s = { ...fertig, gesellschaften: [ges, { ...ges, id: "g2", nr: 2, name: "OSWA", datev: false, briefbogen: false, kontierungEingestellt: false, bankimporte: 0 }] };
    expect(punkt(s, "datev")).toMatchObject({ status: "fehlt", text: "Fehlt bei: 2 OSWA.", link: "/gesellschaften/g2" });
    expect(punkt(s, "briefbogen").status).toBe("warnung");
    expect(punkt(s, "kontierung")).toMatchObject({ status: "warnung", link: "/buchhaltung?g=g2" });
    expect(punkt(s, "bankabgleich").link).toBe("/bankabgleich?g=g2");
  });
  it("Partner- und Projektprüfungen", () => {
    const s = { ...fertig, partner: { ...fertig.partner, handwerkerOhneIban: 2, kaeuferOhneEmail: 3 }, projekte: [{ id: "p1", nr: 101, suchcode: "LINDENWEG", einheiten: 12, meaSumme: "987.500" }, { id: "p2", nr: 102, suchcode: "PARK", einheiten: 0, meaSumme: null }] };
    expect(punkt(s, "hw-iban").text).toMatch(/2 Handwerker ohne IBAN/);
    expect(punkt(s, "kaeufer").text).toMatch(/3 ohne E-Mail/);
    expect(punkt(s, "mea")).toMatchObject({ status: "warnung", link: "/projekte/p1" });
    expect(punkt(s, "mea").text).toMatch(/101 LINDENWEG \(987,5 ‰\)/);
    expect(punkt(s, "projekte").text).toMatch(/Ohne Einheiten: 102 PARK/);
  });
});
