# Bauträger-Plattform

Webbasierte Software für Bauträger: Projekte, Einheiten, Verkauf nach MaBV, Kostenkontrolle mit Handwerkerverträgen,
Mängelmanagement, Auswertungen – mit Anbindung an DATEV, Microsoft Outlook und KI-Assistenten über MCP.

Fachkonzept: [Bauträger-Plattform – Fachkonzept](https://claude.ai/code/artifact/af974a52-9a18-4d5d-9fda-9ae9934284b1)

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `packages/domain` | Fachlogik ohne UI/DB: Geldarithmetik (decimal.js), MaBV-Ratenplan (§ 3 MaBV), Prüfkette Handwerkerrechnung inkl. Bauabzugsteuer, DATEV-EXTF-Export |
| `packages/db` | PostgreSQL-Schema (Drizzle), Migrationen, Demodaten |
| `apps/api` | REST-API (NestJS): `/api/health`, `/api/projekte`, `/api/mabv/ratenplan`, `/api/datev/extf` |
| `apps/mcp` | MCP-Server (stdio und Streamable HTTP) mit Tools für KI-Assistenten |
| `apps/web` | Weboberfläche (Next.js): Projektliste, MaBV-Rechner |

## Schnellstart

Voraussetzungen: Node.js 22, pnpm 10, Docker.

```bash
pnpm install
docker compose up -d                 # PostgreSQL 16
cp .env.example .env
export DATABASE_URL=postgres://bt:bt@localhost:5432/bautraeger
pnpm --filter @bt/domain build && pnpm --filter @bt/db build
pnpm db:migrate
pnpm --filter @bt/db seed            # fiktive Demodaten
pnpm dev:api                         # http://localhost:3001/api
pnpm dev:web                         # http://localhost:3000
```

Tests und Typprüfung: `pnpm test` und `pnpm typecheck`.

## MCP-Server

```bash
pnpm --filter @bt/mcp build
# lokal (z. B. Claude Desktop): Befehl `node apps/mcp/dist/index.js`, Umgebungsvariable DATABASE_URL
# als HTTP-Endpunkt:
DATABASE_URL=... node apps/mcp/dist/index.js --http   # http://localhost:3002/mcp
```

Tools: `mabv_ratenplan_berechnen`, `handwerker_pruefkette`, `projekte_auflisten`, `offene_zahlungsanforderungen`.
Der HTTP-Endpunkt hat noch keine Authentifizierung – vor jedem Betrieb außerhalb von localhost OAuth ergänzen.

## Wichtige Hinweise

- **Geldbeträge** nie als JavaScript-`number` rechnen: in der DB `numeric(14,2)`, im Code `Money` aus `@bt/domain`.
- **DATEV-EXTF-Format:** Kopfzeile und Spaltenpositionen (1–39) vor dem Produktiveinsatz gegen die offizielle
  DATEV-Formatbeschreibung prüfen und mit dem Steuerberater einen Testimport machen.
- **Steuer- und MaBV-Logik** ist mit Testfällen abgesichert, ersetzt aber keine fachliche Prüfung durch Steuerberater
  bzw. Fachanwalt.

## Nächste Schritte (Roadmap Phase 0/1)

1. Login über Microsoft Entra ID, Rollen je Gesellschaft
2. CRUD-Masken: Geschäftspartner, Projekte, Einheiten
3. Kaufverträge mit Ratenplan, Bautenstand, Zahlungsanforderungen, Offene Posten, Mahnwesen
4. Gewerke, Handwerkerverträge, Eingangsrechnungen mit Freigabe-Workflow
5. Buchungsjournal automatisch aus Verkauf und Kosten befüllen
