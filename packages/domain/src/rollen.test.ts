import { describe, expect, it } from "vitest";
import { benoetigtesRecht, darf, rechteVon, rollenAus, rollenText } from "./rollen.js";

describe("Rollen und Rechte", () => {
  it("ordnet API-Aufrufe Rechten zu", () => {
    const r = (m: string, p: string) => benoetigtesRecht(m, p);
    expect(r("GET", "/eingangsrechnungen")).toBe("lesen");
    expect(r("POST", "/eingangsrechnungen")).toBe("kostenPruefen");
    expect(r("POST", "/eingangsrechnungen/abc/pruefen")).toBe("kostenPruefen");
    expect(r("POST", "/eingangsrechnungen/abc/freigeben")).toBe("kostenFreigeben");
    expect(r("POST", "/eingangsrechnungen/abc/zahlung")).toBe("zahlungen");
    expect(r("POST", "/zahlungslaeufe")).toBe("zahlungen");
    expect(r("POST", "/bauabzug/anmeldungen")).toBe("zahlungen");
    expect(r("POST", "/kaufvertraege/abc/portal")).toBe("verkauf");
    expect(r("POST", "/projekte/abc/zahlungsanforderungen")).toBe("verkauf");
    expect(r("POST", "/zahlungseingaenge")).toBe("verkaufZahlungen");
    expect(r("POST", "/maengel/abc/ruegen")).toBe("bau");
    expect(r("PUT", "/vorgaenge/abc")).toBe("bau");
    expect(r("POST", "/projekte/abc/bauzeitenplan/verschieben")).toBe("bau");
    expect(r("POST", "/projekte/abc/gewerkeplan")).toBe("kostenBearbeiten");
    expect(r("POST", "/projekte")).toBe("projekte");
    expect(r("PUT", "/projekte/abc")).toBe("projekte");
    expect(r("POST", "/projekte/abc/einheiten")).toBe("projekte");
    expect(r("POST", "/partner")).toBe("stammdaten");
    expect(r("POST", "/import/partner/ausfuehren")).toBe("stammdaten");
    expect(r("POST", "/import/einheiten/pruefen")).toBe("projekte");
    expect(r("PUT", "/benachrichtigungen/einstellungen")).toBe("verwaltung");
    expect(r("POST", "/gesellschaften")).toBe("verwaltung");
    expect(r("DELETE", "/irgendwas/neues")).toBe("verwaltung");
  });

  it("vergibt Rechte je Rolle", () => {
    expect(darf(["Bautraeger.Steuerberater"], "lesen")).toBe(true);
    expect(darf(["Bautraeger.Steuerberater"], "dokumente")).toBe(false);
    expect(darf(["Bautraeger.Bauleitung"], "kostenPruefen")).toBe(true);
    expect(darf(["Bautraeger.Bauleitung"], "kostenFreigeben")).toBe(false);
    expect(darf(["Bautraeger.Buchhaltung"], "zahlungen")).toBe(true);
    expect(darf(["Bautraeger.Vertrieb"], "zahlungen")).toBe(false);
    expect(darf(["Bautraeger.Vertrieb", "Bautraeger.Bauleitung"], "bau")).toBe(true);
    expect(rechteVon(["Bautraeger.Admin"])).toContain("verwaltung");
    expect(rechteVon([])).toEqual([]);
  });

  it("übernimmt nur bekannte Rollen", () => {
    expect(rollenAus("Bautraeger.Bauleitung, Unbekannt ,Bautraeger.Admin")).toEqual(["Bautraeger.Bauleitung", "Bautraeger.Admin"]);
    expect(rollenAus(["Bautraeger.Vertrieb", 5])).toEqual(["Bautraeger.Vertrieb"]);
    expect(rollenAus(undefined)).toEqual([]);
    expect(rollenText(["Bautraeger.Geschaeftsfuehrung", "Bautraeger.Vertrieb"])).toBe("Geschäftsführung, Vertrieb");
  });
});
