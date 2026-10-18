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
});
