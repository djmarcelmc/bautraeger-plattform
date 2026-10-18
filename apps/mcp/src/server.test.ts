import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { erstelleServer } from "./server.js";

async function verbinde(apiUrl?: string) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([erstelleServer(undefined, apiUrl).connect(a), client.connect(b)]);
  return client;
}

afterEach(() => vi.unstubAllGlobals());

describe("MCP-Server", () => {
  it("bietet die Rechen-Tools an", async () => {
    const client = await verbinde();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["mabv_ratenplan_berechnen", "handwerker_pruefkette"]);
  });

  it("berechnet einen MaBV-Ratenplan", async () => {
    const client = await verbinde();
    const res = await client.callTool({ name: "mabv_ratenplan_berechnen", arguments: { vertragssumme: "324930.00" } });
    const plan = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(plan[0]).toMatchObject({ rate: 1, prozent: "30.00", betrag: "97.479,00" });
    expect(plan).toHaveLength(7);
  });

  it("listet anforderbare Raten über die API", async () => {
    const antworten: Record<string, unknown> = {
      "/kaufvertraege": [{ id: "k1" }],
      "/kaufvertraege/k1": {
        nr: "KV-101-001",
        projekt: { nr: 101, suchcode: "LINDENWEG" },
        kaeufer: [{ firma: null, vorname: "Erika", nachname: "Muster" }],
        raten: [
          { nr: 1, betrag: "97479.00", status: "bezahlt", text: "Erdarbeiten" },
          { nr: 2, betrag: "90980.40", status: "anforderbar", text: "Rohbau" },
        ],
        voraussetzungen: { vertragWirksam: true, vormerkungEingetragen: true, lastenfreistellungGesichert: true, buergschaftNach7: false, anforderungssperre: false },
      },
    };
    vi.stubGlobal("fetch", async (url: string) => {
      const pfad = new URL(url).pathname.replace("/api", "");
      return new Response(JSON.stringify(antworten[pfad]), { status: 200 });
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "anforderbare_raten", arguments: {} });
    const daten = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(daten[0]).toMatchObject({ kaufvertrag: "KV-101-001", kaeufer: "Erika Muster", summeAnforderbar: "90.980,40", fehlendeVoraussetzungen: [] });
    expect(daten[0].anforderbar).toEqual([{ rate: 2, betrag: "90.980,40", bauabschnitt: "Rohbau" }]);
  });

  it("fasst den Kostenstand eines Projekts zusammen", async () => {
    const stand = { geschaetzt: "493200", vergeben: "100000", nachtraege: "5000", summeVergeben: "105000", berechnet: "38500", bezahlt: "34917.57", trend: "105000", abweichung: "388200" };
    const antworten: Record<string, unknown> = {
      "/projekte": [{ id: "p1", nr: 101, suchcode: "LINDENWEG" }],
      "/projekte/p1/kosten": {
        summe: stand,
        gewerke: [
          { nr: 300, bezeichnung: "Rohbau", stand, vertraege: [{ handwerker: { firma: "Rohbau Muster KG", nachname: null, suchcode: "ROHBAU" } }] },
          { nr: 311, bezeichnung: "Erdarbeiten", stand, vertraege: [] },
        ],
      },
      "/eingangsrechnungen": [{ rechnungsnr: "AR-2", status: "rechnerisch_geprueft", handwerker: "Rohbau Muster KG", gewerk: "Rohbau", betragBrutto: "60000", geprueftKumuliert: "58000", eingangAm: "2026-11-01" }],
    };
    vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify(antworten[new URL(url).pathname.replace("/api", "")]), { status: 200 }));
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "kostenstand", arguments: { projektNr: 101 } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.summe.abweichung).toBe("388.200,00 €");
    expect(d.vergebeneGewerke).toHaveLength(1);
    expect(d.vergebeneGewerke[0]).toMatchObject({ gewerk: "300 Rohbau", vertragspartner: "Rohbau Muster KG" });
    expect(d.offeneRechnungen[0]).toMatchObject({ rechnung: "AR-2", schritt: "freizugeben", betragKumuliert: "58.000,00 €" });
  });

  it("listet offene Mängel mit Status und Frist", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("status")).toBe("ueberfaellig");
      return new Response(
        JSON.stringify([{ nr: 1, projektNr: 382, projekt: "HANSEATEN-21", titel: "Entwässerung Dach", ort: "Dach", einheit: null, handwerker: "Flaschnerei Beispiel", status: "ueberfaellig", ruegen: 3, fristBis: "2025-07-15", einbehalt: true }]),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "maengel_offen", arguments: { nurUeberfaellig: true } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d[0]).toMatchObject({ mangel: "382-1", einheit: "Gemeinschaft", status: "Frist überschritten", ruegen: 3 });
  });

  it("liefert die Liquiditätsbetrachtung je Projekt", async () => {
    const b = (t: string, a: string, z: string, o: string) => ({ trend: t, angefordert: a, bezahlt: z, offen: o });
    const zeile = { erloese: b("330000", "93000", "50000", "43000"), kosten: b("180000", "50000", "50000", "0"), saldo: b("150000", "43000", "0", "43000") };
    vi.stubGlobal("fetch", async (url: string) => {
      expect(new URL(url).searchParams.get("projekte")).toBe("alle");
      return new Response(
        JSON.stringify({ gesellschaften: [{ gesellschaft: { name: "Muster Wohnbau GmbH" }, projekte: [{ projekt: { nr: 101, suchcode: "LINDENWEG" }, ...zeile }], summe: zeile }], gesamt: zeile, stand: "2026-10-18" }),
        { status: 200 },
      );
    });
    const client = await verbinde("http://api.test");
    const res = await client.callTool({ name: "liquiditaet", arguments: { alleProjekte: true } });
    const d = JSON.parse((res.content as { text: string }[])[0]!.text);
    expect(d.gesellschaften[0].projekte[0]).toMatchObject({ projekt: "101 LINDENWEG", saldo: { trend: "150.000,00 €" } });
    expect(d.gesamt.erloese.offen).toBe("43.000,00 €");
  });
});
