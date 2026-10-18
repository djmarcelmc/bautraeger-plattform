import { describe, expect, it } from "vitest";
import { EinheitEingabe, GesellschaftEingabe, PartnerEingabe, ProjektEingabe, ibanGueltig, normalisiereDezimal } from "./stammdaten.js";

describe("normalisiereDezimal", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234.56", "1234.56"],
    ["316.930,00 €", "316930.00"],
    ["97,64", "97.64"],
    ["98.000", "98000"],
    ["1.234.567", "1234567"],
    ["1.5", "1.5"],
    ["97.64", "97.64"],
    ["", null],
  ])("%s → %s", (ein, aus) => expect(normalisiereDezimal(ein)).toBe(aus));

  it("lehnt Unsinn ab", () => expect(() => normalisiereDezimal("12a")).toThrow());
});

describe("IBAN", () => {
  it("erkennt gültige und ungültige IBAN", () => {
    expect(ibanGueltig("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(ibanGueltig("DE89 3704 0044 0532 0130 01")).toBe(false);
    expect(ibanGueltig("DE89")).toBe(false);
  });
});

describe("Schemas", () => {
  const gid = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

  it("Projekt: Pflichtfelder, Großschreibung, leere Felder → null", () => {
    const p = ProjektEingabe.parse({ gesellschaftId: gid, nr: "332", suchcode: "paulinenstrasse", ort: "", baubeginnSoll: "" });
    expect(p).toMatchObject({ nr: 332, suchcode: "PAULINENSTRASSE", ort: null, baubeginnSoll: null, art: "bautraeger" });
    expect(ProjektEingabe.safeParse({ gesellschaftId: gid, nr: 1, suchcode: "" }).success).toBe(false);
    expect(ProjektEingabe.safeParse({ gesellschaftId: gid, nr: 1, suchcode: "X", projektbeginn: "1.1.2026" }).success).toBe(false);
  });

  it("Einheit: deutsche Zahlen und Nachkommastellen", () => {
    const e = EinheitEingabe.parse({ nr: "01", typ: "wohnung", wohnflaeche: "97,64", vkBrutto: "312.448,00", preisProM2: "" });
    expect(e).toMatchObject({ wohnflaeche: "97.64", vkBrutto: "312448.00", preisProM2: null, bauabschnitt: 1 });
    expect(EinheitEingabe.safeParse({ nr: "01", typ: "wohnung", vkBrutto: "1,234" }).success).toBe(false);
  });

  it("Partner: Firma oder Nachname, gültige IBAN und E-Mail", () => {
    const basis = { nr: 1, suchcode: "muster", rollen: ["kunde"] };
    expect(PartnerEingabe.safeParse(basis).success).toBe(false);
    expect(PartnerEingabe.safeParse({ ...basis, nachname: "Muster", iban: "DE00 1234" }).success).toBe(false);
    expect(PartnerEingabe.safeParse({ ...basis, nachname: "Muster", email: "kein-mail" }).success).toBe(false);
    const ok = PartnerEingabe.parse({ ...basis, nachname: "Muster", iban: "de89 3704 0044 0532 0130 00", email: "" });
    expect(ok).toMatchObject({ suchcode: "MUSTER", iban: "DE89370400440532013000", email: null });
  });

  it("Gesellschaft: leere DATEV-Felder aus dem Formular → null, ungültige mit deutscher Meldung", () => {
    const g = GesellschaftEingabe.parse({ nr: "1", name: "Muster GmbH", datevBeraternr: "", datevMandantennr: "", sachkontenlaenge: "4", skr: "03" });
    expect(g).toMatchObject({ datevBeraternr: null, datevMandantennr: null, sachkontenlaenge: 4 });
    expect(GesellschaftEingabe.parse({ nr: 1, name: "X", datevBeraternr: "1234567" }).datevBeraternr).toBe(1234567);
    const fehler = GesellschaftEingabe.safeParse({ nr: 1, name: "X", datevBeraternr: "12" }).error!.issues[0]!.message;
    expect(fehler).toBe("Mindestens 1000");
    const deutsch = GesellschaftEingabe.safeParse({ nr: 1, name: "X", skr: "05" }).error!.issues[0]!.message;
    expect(deutsch).not.toMatch(/expected|Invalid/);
  });
});
