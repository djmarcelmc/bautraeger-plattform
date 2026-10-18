import { describe, expect, it } from "vitest";
import { BRIEFBOGEN_STANDARD, BriefbogenEinstellung, briefbogenCss } from "./briefbogen.js";

describe("Briefbogen", () => {
  it("hat DIN-nahe Standardwerte und versteht deutsche Zahlen", () => {
    expect(BRIEFBOGEN_STANDARD).toMatchObject({ randObenErsteSeite: 45, randObenFolgeseiten: 30, randUnten: 25, randLinks: 25, randRechts: 20, textAb: null, absenderzeileAusblenden: true, datumX: null });
    const e = BriefbogenEinstellung.parse({ randLinks: "28,7", textAb: "108", datumX: "159", datumY: "102", zeichenX: "123,7", zeichenY: "102", zeichenText: "MD", absenderzeileAusblenden: "" });
    expect(e).toMatchObject({ randLinks: 28.7, textAb: 108, datumX: 159, zeichenText: "MD", absenderzeileAusblenden: false });
  });

  it("prüft unvollständige Felder und Ränder", () => {
    const r = BriefbogenEinstellung.safeParse({ datumX: "150", randUnten: "200", textAb: "20" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual(expect.arrayContaining(["Für das Datumsfeld beide Werte angeben", "höchstens 80 mm", "„Text ab“ muss unter dem oberen Rand liegen"]));
  });

  it("erzeugt Satzspiegel und Feldpositionen für Bildschirm und Druck", () => {
    const css = briefbogenCss(BriefbogenEinstellung.parse({ randObenErsteSeite: 45, randObenFolgeseiten: 35, randLinks: 28, textAb: 108, datumX: 159, datumY: 102 }));
    expect(css).toContain("@page { size: A4; margin: 35mm 20mm 25mm 28mm; }");
    expect(css).toContain("padding: 10mm 0 0 0 !important"); // erste Seite: 45 − 35
    expect(css).toContain("min-height: 63mm"); // 108 − 45
    expect(css).toContain(".briefbogen-datum { top: 102mm; left: 159mm; }");
    expect(css).toContain(".briefbogen-datum { top: 67mm; left: 131mm; }");
    expect(css).toContain(".info-datum { display: none; }");
    expect(briefbogenCss(BRIEFBOGEN_STANDARD)).not.toContain("briefbogen-datum");
  });
});
