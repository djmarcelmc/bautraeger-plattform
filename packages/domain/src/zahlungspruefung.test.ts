import { describe, expect, it } from "vitest";
import { ibanPruefen } from "./zahlungspruefung.js";

const IBAN = "DE02120300000000202051";
const ALT = "DE89370400440532013000";
const basis = { iban: IBAN, aenderungen: [], bisherGezahlt: [IBAN], rechnungsIban: null, stichtag: "2026-10-18", benutzer: "a@x.de", vierAugen: true };

describe("ibanPruefen", () => {
  it("bekannte IBAN, keine Änderung → nichts zu bestätigen", () => {
    expect(ibanPruefen(basis)).toEqual({ hinweise: [], bestaetigungNoetig: false, gesperrt: null });
  });
  it("abweichende IBAN auf der Rechnung ist kritisch", () => {
    const r = ibanPruefen({ ...basis, rechnungsIban: ALT });
    expect(r.bestaetigungNoetig).toBe(true);
    expect(r.hinweise[0]!.text).toBe("IBAN auf der Rechnung (DE89 … 3000) weicht von der hinterlegten (DE02 … 2051) ab");
  });
  it("kürzlich geänderte IBAN: kritisch; selbst geändert → gesperrt (nur mit Anmeldung)", () => {
    const aenderungen = [{ am: "2026-10-10T09:00:00Z", von: "a@x.de", alt: ALT, neu: IBAN }];
    const r = ibanPruefen({ ...basis, aenderungen, bisherGezahlt: [ALT] });
    expect(r.hinweise.map((h) => [h.stufe, h.text])).toEqual([
      ["kritisch", "IBAN am 10.10.2026 von a@x.de geändert (vorher DE89 … 3000)"],
      ["kritisch", "Erste Zahlung an diese IBAN – bisher an DE89 … 3000 gezahlt"],
    ]);
    expect(r.gesperrt).toMatch(/Vier-Augen/);
    expect(ibanPruefen({ ...basis, aenderungen, benutzer: "b@x.de" }).gesperrt).toBeNull();
    expect(ibanPruefen({ ...basis, aenderungen, vierAugen: false }).gesperrt).toBeNull();
  });
  it("Änderung älter als 30 Tage zählt nicht; Neuanlage ist nur ein Hinweis", () => {
    expect(ibanPruefen({ ...basis, aenderungen: [{ am: "2026-08-01T09:00:00Z", von: "a@x.de", alt: ALT, neu: IBAN }] }).hinweise).toEqual([]);
    const r = ibanPruefen({ ...basis, bisherGezahlt: [], aenderungen: [{ am: "2026-10-15T09:00:00Z", von: "b@x.de", alt: null, neu: IBAN, angelegt: true }] });
    expect(r.bestaetigungNoetig).toBe(false);
    expect(r.hinweise.map((h) => h.text)).toEqual(["Handwerker am 15.10.2026 mit dieser IBAN angelegt (von b@x.de)", "Erste Zahlung an diesen Handwerker"]);
  });
  it("ohne IBAN keine Prüfung", () => {
    expect(ibanPruefen({ ...basis, iban: null }).hinweise).toEqual([]);
  });
});
