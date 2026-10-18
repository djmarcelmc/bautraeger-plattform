import { describe, expect, it } from "vitest";
import { money } from "./money.js";
import {
  KaufvertragEingabe,
  datumPlusTage,
  fertigeAbschnitteFuerVertrag,
  ratenStatus,
  rechnungsnummer,
} from "./verkauf.js";

const u = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("Kaufvertrag-Eingabe", () => {
  const basis = {
    projektId: u(1),
    zahlungsanforderungAn: u(2),
    kaeufer: [{ partnerId: u(2), anteilProzent: "100" }],
    einheiten: [{ einheitId: u(3), vkBrutto: "316.930,00" }],
  };

  it("akzeptiert einen gültigen Vertrag mit Standardwerten", () => {
    const v = KaufvertragEingabe.parse(basis);
    expect(v.zahlungszielTage).toBe(10);
    expect(v.einheiten[0]!.vkBrutto).toBe("316930.00");
  });

  it("prüft Käuferanteile, Doppelungen, Preise und Ratenplan", () => {
    const fehler = (x: object) => KaufvertragEingabe.safeParse({ ...basis, ...x }).error?.issues.map((i) => i.message).join(" | ");
    expect(fehler({ kaeufer: [{ partnerId: u(2), anteilProzent: "50" }] })).toMatch(/50.00 % statt 100 %/);
    expect(fehler({ kaeufer: [{ partnerId: u(2), anteilProzent: "50" }, { partnerId: u(2), anteilProzent: "50" }] })).toMatch(/doppelt/);
    expect(fehler({ einheiten: [{ einheitId: u(3), vkBrutto: "" }] })).toMatch(/Verkaufspreis/);
    expect(fehler({ raten: [{ abschnitte: ["erdarbeiten"] }] })).toMatch(/fehlt im Ratenplan/);
  });
});

describe("Bautenstand je Vertrag", () => {
  const we = { id: "we", typ: "wohnung" };
  const st = { id: "st", typ: "stellplatz" };

  it("richtet sich nach der Wohnung, Stellplätze laufen mit", () => {
    const f = fertigeAbschnitteFuerVertrag([we, st], [{ einheitId: "we", abschnitt: "erdarbeiten" }]);
    expect([...f]).toEqual(["erdarbeiten"]);
  });

  it("verlangt alle Wohnungen eines Vertrags", () => {
    const f = fertigeAbschnitteFuerVertrag(
      [we, { id: "we2", typ: "wohnung" }],
      [{ einheitId: "we", abschnitt: "rohbau" }],
    );
    expect(f.size).toBe(0);
  });

  it("nutzt Stellplätze, wenn der Vertrag nur Stellplätze enthält", () => {
    const f = fertigeAbschnitteFuerVertrag([st], [{ einheitId: "st", abschnitt: "erdarbeiten" }]);
    expect(f.has("erdarbeiten")).toBe(true);
  });
});

describe("Ratenstatus", () => {
  const r = { angefordert: false, betrag: money(1000), bezahlt: money(0), abschnitteFertig: false, voraussetzungenErfuellt: true };
  it.each([
    [{}, "offen"],
    [{ abschnitteFertig: true }, "anforderbar"],
    [{ abschnitteFertig: true, voraussetzungenErfuellt: false }, "gesperrt"],
    [{ angefordert: true }, "angefordert"],
    [{ angefordert: true, bezahlt: money(400) }, "teilbezahlt"],
    [{ angefordert: true, bezahlt: money(1000) }, "bezahlt"],
  ])("%o → %s", (x, s) => expect(ratenStatus({ ...r, ...x })).toBe(s));
});

describe("Hilfsfunktionen", () => {
  it("rechnet Fälligkeiten über Monats- und Jahresgrenzen", () => {
    expect(datumPlusTage("2026-12-28", 10)).toBe("2027-01-07");
    expect(datumPlusTage("2028-02-25", 5)).toBe("2028-03-01");
  });
  it("formatiert Rechnungsnummern", () => expect(rechnungsnummer("ZA", 2026, 42)).toBe("ZA-2026-00042"));
});
