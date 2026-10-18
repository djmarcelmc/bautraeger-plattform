import { describe, expect, it } from "vitest";
import { BenachrichtigungEinstellung, mailAufgaben, mailMangelEingang, mailMangelGemeldet, mailMangelStatus } from "./mailtexte.js";

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
