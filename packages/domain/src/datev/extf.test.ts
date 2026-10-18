import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { money } from "../money.js";
import { extfBuchungsstapel, extfBuchungsstapelText } from "./extf.js";

const kopf = {
  beraternummer: 1234567,
  mandantennummer: 10001,
  wjBeginn: new Date(2026, 0, 1),
  sachkontenlaenge: 4,
  datumVon: new Date(2026, 9, 1),
  datumBis: new Date(2026, 9, 31),
  bezeichnung: "Raten Oktober",
  erzeugtAm: new Date(2026, 9, 18, 9, 30, 0, 0),
};

describe("DATEV EXTF Buchungsstapel", () => {
  const text = extfBuchungsstapelText(kopf, [
    {
      umsatz: money("97479.00"),
      sollHaben: "S",
      konto: "10929",
      gegenkonto: "8000",
      belegdatum: new Date(2026, 9, 17),
      belegfeld1: "ZA-21930",
      buchungstext: "Rate 1 Erdarbeiten Paulinenstraße WE01",
      kost1: "332",
    },
  ]);
  const zeilen = text.split("\r\n");

  it("schreibt Kopfzeile, Spaltenzeile und Buchungen", () => {
    expect(zeilen[0]).toMatch(/^"EXTF";700;21;"Buchungsstapel";13;20261018093000000;/);
    expect(zeilen[0]).toContain(";1234567;10001;20260101;4;20261001;20261031;\"Raten Oktober\";");
    expect(zeilen[1]!.split(";")[0]).toBe("Umsatz (ohne Soll/Haben-Kz)");
    expect(zeilen[1]!.split(";")[36]).toBe("KOST1 - Kostenstelle");
    const felder = zeilen[2]!.split(";");
    expect(felder[0]).toBe("97479,00");
    expect(felder[1]).toBe('"S"');
    expect(felder[9]).toBe("1710");
    expect(felder[36]).toBe('"332"');
    expect(felder).toHaveLength(zeilen[1]!.split(";").length);
  });

  it("kodiert in Windows-1252", () => {
    const buf = extfBuchungsstapel(kopf, [
      { umsatz: money(1), sollHaben: "H", konto: "1200", gegenkonto: "70001", belegdatum: new Date(2026, 9, 1), buchungstext: "Straße" },
    ]);
    expect(buf.includes(Buffer.from([0xdf]))).toBe(true); // ß
    expect(iconv.decode(buf, "win1252")).toContain("Straße");
  });

  it("lehnt negative Beträge ab", () => {
    expect(() =>
      extfBuchungsstapelText(kopf, [
        { umsatz: money(-1), sollHaben: "S", konto: "1", gegenkonto: "2", belegdatum: new Date() },
      ]),
    ).toThrow();
  });
});
