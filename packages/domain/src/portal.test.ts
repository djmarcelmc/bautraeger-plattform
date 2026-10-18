import { describe, expect, it } from "vitest";
import { PortalMeldung, bildformat, portalStatus } from "./portal.js";

describe("Käuferportal", () => {
  it("prüft Meldungen", () => {
    expect(PortalMeldung.safeParse({ einheitId: "x", titel: "" }).success).toBe(false);
    expect(PortalMeldung.parse({ einheitId: "6b1f0c1e-5c2a-4c1e-9d1a-0a1b2c3d4e5f", titel: " Fenster undicht ", ort: "" })).toMatchObject({ titel: "Fenster undicht", ort: null, bereich: "sonder" });
  });
  it("zeigt einen vereinfachten Status", () => {
    expect(portalStatus({ erledigtAm: null, handwerkerId: null }, 0)).toBe("eingegangen");
    expect(portalStatus({ erledigtAm: null, handwerkerId: "h" }, 0)).toBe("in_bearbeitung");
    expect(portalStatus({ erledigtAm: null, handwerkerId: null }, 1)).toBe("in_bearbeitung");
    expect(portalStatus({ erledigtAm: "2026-10-01", handwerkerId: "h" }, 2)).toBe("erledigt");
  });
  it("erkennt Bildformate an den Magic Bytes", () => {
    const bytes = (...x: (number | string)[]) => new Uint8Array(x.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));
    expect(bildformat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(bildformat(bytes(0x89, "PNG"))).toBe("image/png");
    expect(bildformat(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(bildformat(bytes(0, 0, 0, 0x18, "ftyp", "heic"))).toBe("image/heic");
    expect(bildformat(bytes("%PDF-1.7"))).toBeNull();
    expect(bildformat(bytes("<svg"))).toBeNull();
  });
});
