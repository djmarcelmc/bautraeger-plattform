import { describe, expect, it } from "vitest";
import { BenachrichtigungEinstellung, mailAufgaben, mailAusText, mailMangelEingang, mailMangelGemeldet, mailMangelStatus, SchreibenVersandEingabe, schreibenVorlage } from "./mailtexte.js";

const m = { bautraeger: "Muster Wohnbau GmbH", projekt: "101 LINDENWEG", nr: "101-7", titel: "Balkontür <klemmt>", ort: "Wohnzimmer", einheit: "02", kaeufer: "Max Beispiel", beschreibung: "Zeile 1\nZeile 2", fotos: 2 };

describe("Mailtexte", () => {
  it("maskiert HTML und enthält den Link für die Bauleitung", () => {
    const x = mailMangelGemeldet(m, "https://projectx.cubivivit.de/maengel/abc");
    expect(x.betreff).toBe("Neue Mängelanzeige 101-7: Balkontür <klemmt>");
    expect(x.html).toContain("Balkontür &lt;klemmt&gt;");
    expect(x.html).not.toContain("<klemmt>");
    expect(x.html).toContain("Zeile 1<br>Zeile 2");
    expect(x.text).toContain("Zur Bearbeitung: https://projectx.cubivivit.de/maengel/abc");
  });
  it("schreibt Käufer persönlich an", () => {
    expect(mailMangelEingang(m, "Sehr geehrter Herr Beispiel").text).toMatch(/^Sehr geehrter Herr Beispiel,/);
    const s = mailMangelStatus(m, "Guten Tag", "erledigt", "2026-10-20");
    expect(s.betreff).toBe("Mängelanzeige Nr. 101-7: erledigt");
    expect(s.text).toContain("am 20.10.2026 als erledigt gemeldet");
  });
  it("fasst Aufgaben zusammen und lässt Infos weg", () => {
    const a = (titel: string, dringlichkeit: "hoch" | "mittel" | "info") => ({ bereich: "verkauf" as const, titel, dringlichkeit, text: "t", link: "/verkauf", betrag: "121680" });
    const x = mailAufgaben([a("Zahlung überfällig", "hoch"), a("Raten anfordern", "mittel"), a("Meilenstein", "info")], "https://x.de/", "2026-10-19")!;
    expect(x.betreff).toBe("Aufgaben am 19.10.2026: 1 dringend, 1 demnächst");
    expect(x.text).toContain("[dringend] Zahlung überfällig – 121.680,00 €");
    expect(x.text).not.toContain("Meilenstein");
    expect(x.text).toContain("https://x.de/verkauf");
    expect(mailAufgaben([a("Meilenstein", "info")], "https://x.de", "2026-10-19")).toBeNull();
  });
  it("liest Empfängerlisten aus Formularen", () => {
    expect(BenachrichtigungEinstellung.parse({ maengelAn: "bau@x.de, gf@x.de", aufgabenAn: "", kaeuferInformieren: "" })).toEqual({ maengelAn: ["bau@x.de", "gf@x.de"], aufgabenAn: [], kaeuferInformieren: false });
    expect(BenachrichtigungEinstellung.safeParse({ maengelAn: "keine-mail" }).success).toBe(false);
  });
});

describe("Schreiben per E-Mail", () => {
  const basis = { bautraeger: "Muster Wohnbau GmbH", anrede: "Sehr geehrter Herr Beispiel", objekt: "LINDENWEG, Wohneinheit 02", nummer: "ZA-2026-00003", betrag: "1930", frist: "2026-10-28" };
  it("schlägt Betreff, Text und Dateinamen vor", () => {
    const za = schreibenVorlage("zahlungsanforderung", basis);
    expect(za.betreff).toBe("Zahlungsanforderung ZA-2026-00003 – Bauvorhaben LINDENWEG, Wohneinheit 02");
    expect(za.text).toContain("über 1.930,00 €. Bitte überweisen Sie den Betrag bis zum 28.10.2026");
    expect(za.dateiname).toBe("ZA-2026-00003.pdf");
    expect(schreibenVorlage("zahlungsanforderung", { ...basis, nurSonderleistungen: true }).betreff).toMatch(/^Rechnung über Sonderleistungen/);
    const m = schreibenVorlage("mahnung", { ...basis, titel: "Letzte Mahnung", frist: "2026-11-04" });
    expect(m).toMatchObject({ betreff: "Letzte Mahnung zu ZA-2026-00003 – Bauvorhaben LINDENWEG, Wohneinheit 02", dateiname: "Letzte-Mahnung-ZA-2026-00003.pdf" });
    const sw = schreibenVorlage("sonderwunsch", { ...basis, nummer: "KV-101-002-3", titel: "Parkett Eiche", betrag: "5200", frist: null });
    expect(sw.text).toContain("„Parkett Eiche“ zum Preis von 5.200,00 €");
    expect(sw.dateiname).toBe("Angebot-Sonderwunsch-KV-101-002-3.pdf");
    expect(schreibenVorlage("sonderwunsch", { ...basis, titel: "Kellertür", gutschrift: true }).betreff).toMatch(/^Gutschrift: Kellertür/);
  });
  it("macht aus dem Text eine HTML-Mail und prüft Empfänger", () => {
    const m = mailAusText("Betreff", "Hallo <Welt>,\nZeile zwei\n\nGruß", "Fuß");
    expect(m.html).toContain("Hallo &lt;Welt&gt;,<br>Zeile zwei");
    expect(m.html.match(/<p /g)).toHaveLength(3);
    expect(SchreibenVersandEingabe.parse({ an: "a@x.de; b@y.de", betreff: "x", text: "y" }).an).toEqual(["a@x.de", "b@y.de"]);
    expect(SchreibenVersandEingabe.safeParse({ an: "kaputt", betreff: "x", text: "y" }).success).toBe(false);
  });
});
