import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { erstelleServer } from "./server.js";

async function verbinde() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([erstelleServer().connect(a), client.connect(b)]);
  return client;
}

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
});
