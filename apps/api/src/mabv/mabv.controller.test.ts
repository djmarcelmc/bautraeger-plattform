import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MabvController } from "./mabv.controller.js";

describe("MabvController", () => {
  const c = new MabvController();

  it("berechnet den Standardplan", () => {
    const plan = c.ratenplan({ vertragssumme: "324930.00" });
    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ prozent: "30.00", betrag: "97479.00" });
  });

  it("lehnt ungültige Eingaben mit 400 ab", () => {
    expect(() => c.ratenplan({ vertragssumme: "abc" })).toThrow(BadRequestException);
    expect(() => c.ratenplan({ vertragssumme: "1000", raten: [{ abschnitte: ["erdarbeiten"] }] })).toThrow(
      BadRequestException,
    );
  });
});
