import { describe, expect, it } from "vitest";
import { angebotAbgelaufen, SonderwunschEingabe, sonderwunschRate, sonderwunschSummen } from "./sonderwunsch.js";

describe("Sonderwünsche", () => {
  it("prüft Eingaben", () => {
    const ok = SonderwunschEingabe.safeParse({ bezeichnung: "Fußbodenheizung Bad", betragBrutto: "2.380,00", kostenBrutto: "1.700", abschnitt: "estrich", angebotAm: "2026-10-01", gueltigBis: "2026-10-31" });
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({ art: "zusatzleistung", betragBrutto: "2380.00", kostenBrutto: "1700", abschnitt: "estrich" });
    const leer = SonderwunschEingabe.safeParse({ bezeichnung: "x", betragBrutto: "0", abschnitt: "" });
    expect(leer.error!.issues.map((i) => i.message)).toContain("Betrag > 0 angeben");
    expect(SonderwunschEingabe.safeParse({ bezeichnung: "x", betragBrutto: "5", abschnitt: "keller" }).success).toBe(false);
    expect(SonderwunschEingabe.safeParse({ bezeichnung: "x", betragBrutto: "5", angebotAm: "2026-10-10", gueltigBis: "2026-10-01" }).success).toBe(false);
  });

  it("erzeugt die Rate bei Beauftragung (Gutschrift negativ)", () => {
    expect(sonderwunschRate({ nr: 3, art: "zusatzleistung", bezeichnung: "Fußbodenheizung", betragBrutto: "2380", abschnitt: "estrich" }, 14)).toEqual({
      nr: 14,
      typ: "zusatzleistung",
      abschnitte: ["estrich"],
      prozent: null,
      betrag: "2380.00",
      text: "Sonderwunsch Nr. 3: Fußbodenheizung",
    });
    expect(sonderwunschRate({ nr: 4, art: "gutschrift", bezeichnung: "Entfall Kellertür", betragBrutto: "450", abschnitt: null }, 15)).toMatchObject({ betrag: "-450.00", abschnitte: [], text: "Gutschrift Nr. 4: Entfall Kellertür" });
  });

  it("summiert Angebote, Beauftragtes und Marge", () => {
    const s = sonderwunschSummen([
      { art: "zusatzleistung", status: "beauftragt", betragBrutto: "2380", kostenBrutto: "1700" },
      { art: "gutschrift", status: "beauftragt", betragBrutto: "450", kostenBrutto: "300" },
      { art: "zusatzleistung", status: "beauftragt", betragBrutto: "1000", kostenBrutto: null },
      { art: "zusatzleistung", status: "angebot", betragBrutto: "5000", kostenBrutto: null },
      { art: "zusatzleistung", status: "abgelehnt", betragBrutto: "999", kostenBrutto: null },
    ]);
    expect(s).toEqual({ angebote: "5000.00", beauftragt: "2930.00", zusatzleistungen: "3380.00", gutschriften: "450.00", marge: "530.00", offeneAngebote: 1 });
    expect(sonderwunschSummen([]).marge).toBeNull();
  });

  it("erkennt abgelaufene Angebote", () => {
    expect(angebotAbgelaufen({ status: "angebot", gueltigBis: "2026-10-01" }, "2026-10-18")).toBe(true);
    expect(angebotAbgelaufen({ status: "beauftragt", gueltigBis: "2026-10-01" }, "2026-10-18")).toBe(false);
  });
});
