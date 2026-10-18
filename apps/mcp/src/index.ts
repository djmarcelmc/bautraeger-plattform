#!/usr/bin/env node
import { verbinden } from "@bt/db";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { erstelleServer } from "./server.js";

const db = process.env.DATABASE_URL ? verbinden(process.env.DATABASE_URL) : undefined;

if (process.argv.includes("--http")) {
  // Zustandsloser Streamable-HTTP-Endpunkt. Vor dem Produktivbetrieb: OAuth-Authentifizierung ergänzen.
  const app = express();
  app.use(express.json());
  app.post("/mcp", async (req, res) => {
    const server = erstelleServer(db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  const port = Number(process.env.MCP_PORT ?? 3002);
  app.listen(port, () => console.error(`MCP-Server läuft auf http://localhost:${port}/mcp`));
} else {
  await erstelleServer(db).connect(new StdioServerTransport());
}
