# Bauträger-Plattform

Webbasierte Software für Bauträger: Projekte, Einheiten, Verkauf nach MaBV, Kostenkontrolle mit Handwerkerverträgen,
Mängelmanagement, Auswertungen – mit Anbindung an DATEV, Microsoft Outlook und KI-Assistenten über MCP.

Fachkonzept: [Bauträger-Plattform – Fachkonzept](https://claude.ai/code/artifact/af974a52-9a18-4d5d-9fda-9ae9934284b1)

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `packages/domain` | Fachlogik ohne UI/DB: Geldarithmetik (decimal.js), MaBV-Ratenplan (§ 3 MaBV), Prüfkette Handwerkerrechnung inkl. Bauabzugsteuer, DATEV-EXTF-Export |
| `packages/db` | PostgreSQL-Schema (Drizzle), Migrationen, Demodaten |
| `apps/api` | REST-API (NestJS): Stammdaten, Verkauf (Kaufverträge, Bautenstand, Zahlungsanforderungen, offene Posten), Kosten (Gewerke, Handwerkerverträge, Nachträge, Eingangsrechnungen), Mängel (Rügen, Fristen), Dokumente, Änderungsprotokoll, DATEV-Export |
| `apps/mcp` | MCP-Server (stdio und Streamable HTTP) mit Tools für KI-Assistenten |
| `apps/web` | Weboberfläche (Next.js): Cockpit (Aufgaben aus allen Bereichen), Projekte (Einheiten, Bautenstand-Raster, Bauzeitenplan als Gantt, Dokumente), Verkauf (Kaufverträge, Raten, Zahlungsanforderung als Druck/PDF, offene Posten), Kosten (Kostenkontrolle je Gewerk, Handwerkerverträge, Rechnungsprüfung mit Prüfkette, Rechnungseingangsbuch), Zahlungsläufe (SEPA), Bürgschaften, Mängel (mobile Erfassung mit Fotos, Rügeschreiben), Abnahmen (Protokoll zum Unterschreiben, Standardmängel), Käuferportal für Mängelanzeigen (ohne Konto, mobil), E-Mail-Benachrichtigungen (Outlook/SMTP, Postausgang), Auswertungen (Liquidität, Liquiditätsplan nach KW, MaBV-Prüfbericht, Controlling, Kostenreport, Projektbericht – Druck A4 quer und Excel), Geschäftspartner, Gesellschaften |
| `docs/` | Anleitungen: [Deployment auf dem vServer](docs/deployment.md), [Microsoft-Entra-App-Registrierung](docs/microsoft-entra-app-registrierung.md) |
| `deploy/`, `Dockerfile`, `docker-compose.prod.yml` | Produktivbetrieb: Caddy (HTTPS, Passwortschutz), PostgreSQL, tägliche Sicherungen, Update-Skript |

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

Die API-Integrationstests laufen zusätzlich gegen eine echte PostgreSQL-Datenbank, wenn `TEST_DATABASE_URL`
gesetzt ist (**die Datenbank wird dabei geleert**):

```bash
TEST_DATABASE_URL=postgres://bt:bt@localhost:5432/bautraeger_test pnpm test
```

## API (Auszug)

| Methode & Pfad | Zweck |
| --- | --- |
| `GET/POST/DELETE /api/kaufvertraege/:id/portal`, öffentlich: `GET /api/portal/:token`, `POST /api/portal/:token/maengel` | Käuferportal: persönlicher Link (nur Hash gespeichert), Mängelanzeige mit Fotos, Bearbeitungsstand |
| `GET /api/benachrichtigungen`, `PUT …/einstellungen`, `POST …/test`, `POST …/aufgaben`, `POST …/nachrichten/:id/erneut` | E-Mail-Benachrichtigungen: Empfänger, Postausgang mit Wiederholungen, Versand über Microsoft 365 (Graph), SMTP oder nur Protokoll |
| `GET /api/cockpit` | Aufgaben aus allen Bereichen nach Dringlichkeit und Kennzahlen für die Startseite |
| `GET/POST /api/gesellschaften`, `GET/PUT /api/gesellschaften/:id` | Gesellschaften |
| `GET /api/partner?suche=&rolle=`, `GET /api/partner/naechste-nr`, `POST`, `GET/PUT /api/partner/:id` | Geschäftspartner |
| `GET /api/projekte?suche=&abgeschlossen=nein\|ja\|alle`, `GET /api/projekte/naechste-nr?gesellschaftId=` | Projektliste, Nummernvorschlag |
| `POST /api/projekte`, `GET/PUT /api/projekte/:id`, `POST /api/projekte/:id/kopieren` | Projekt anlegen, lesen (inkl. Einheiten), ändern, kopieren |
| `POST /api/projekte/:id/einheiten`, `GET/PUT/DELETE /api/einheiten/:id` | Einheiten |
| `GET /api/protokoll/:datensatzId` | Änderungsprotokoll (GoBD) |
| `GET/POST /api/kaufvertraege`, `GET /api/kaufvertraege/:id`, `PUT /api/kaufvertraege/:id/konditionen` | Kaufvertrag inkl. automatischem MaBV-Ratenplan, Ratenstatus und Summen |
| `GET/POST /api/projekte/:id/bautenstand`, `DELETE /api/bautenstand/:id` | Bautenstand melden / zurücknehmen (gesperrt nach Anforderung) |
| `POST /api/zahlungsanforderungen`, `POST /api/projekte/:id/zahlungsanforderungen`, `GET /api/zahlungsanforderungen/:id` | Raten anfordern (einzeln, zusammengefasst oder als Sammelanforderung je Projekt) |
| `POST /api/zahlungseingaenge`, `GET /api/offene-posten` | Zahlungen verbuchen (keine Überzahlung), offene Posten mit Verzugstagen |
| `GET /api/mahnwesen/vorschlag?stichtag=`, `POST /api/mahnungen`, `GET /api/mahnungen?ids=` | Mahnvorschlag mit Verzugszinsen, Mahnlauf (Erinnerung → Mahnung → letzte Mahnung), Druckdaten |
| `GET/POST /api/basiszinssaetze` | Basiszinssätze nach § 247 BGB (vorbelegt bis 01.07.2026, neue Werte in den Einstellungen nachtragen) |
| `GET/POST /api/dokumente`, `GET /api/dokumente/:id/datei`, `DELETE /api/dokumente/:id` | Dokumentablage (SHA-256, nur Ausblenden statt Löschen) |
| `GET /api/projekte/:id/kosten`, `POST /api/projekte/:id/gewerkeplan`, `POST /api/projekte/:id/gewerke`, `PUT/DELETE /api/gewerke/:id` | Kostenkontrolle, Gewerkeplan aus Vorlage (65 Gewerke), Gewerke |
| `POST /api/handwerkervertraege`, `GET/PUT /api/handwerkervertraege/:id`, `POST /api/handwerkervertraege/:id/nachtraege`, `PUT /api/nachtraege/:id` | Handwerkerverträge (Nachlass, Skonto, Umlagen, Einbehalte) und Nachträge |
| `GET /api/maengel?projektId=&status=offen\|ueberfaellig\|erledigt\|alle`, `POST /api/maengel`, `GET/PUT /api/maengel/:id` | Mängel mit Status und Fristen |
| `POST /api/maengel/:id/ruegen`, `…/erledigt`, `…/wiedereroeffnen` | Rügen (höchstens drei, Standardfristen 14/10/7 Tage), Erledigung |
| `GET /api/auswertungen/liquiditaet?gesellschaftId=&projekte=alle`, `…/controlling`, `…/kostenreport/:projektId`, `…/projektbericht/:projektId` | Auswertungen; mit `format=xlsx` als Excel-Datei |
| `GET/POST /api/projekte/:id/bauzeitenplan`, `POST …/bauzeitenplan/verschieben`, `POST /api/projekte/:id/vorgaenge`, `PUT/DELETE /api/vorgaenge/:id` | Bauzeitenplan: Vorlage (25 Vorgänge, alle MaBV-Meilensteine), Vorgänge mit Gewerken, Plan verschieben |
| `GET /api/auswertungen/liquiditaetsplan?projektId=&wochen=&anfangsbestand=&unverkauft=1&stichtag=` | Liquiditätsplan nach Kalenderwochen (auch `format=xlsx`) |
| `GET /api/zahlungslaeufe/vorschlag?ausfuehrungAm=`, `POST /api/zahlungslaeufe`, `GET /api/zahlungslaeufe[/:id]`, `GET …/:id/xml` | Zahlungsvorschlag, Zahlungslauf mit Verbuchung, SEPA-Datei (pain.001.001.09) |
| `GET/POST /api/buergschaften?status=offen\|handlung&richtung=`, `GET/PUT/DELETE /api/buergschaften/:id` | Bürgschaften (erhalten/§ 7 MaBV) mit Ablauf- und Rückgabeüberwachung |
| `GET /api/abnahmen?projektId=`, `POST /api/projekte/:id/abnahmen`, `GET/PUT/DELETE /api/abnahmen/:id`, `POST …/:id/maengel`, `POST …/:id/abschliessen` | Abnahmen (Sondereigentum, Gemeinschaftseigentum, Handwerker) mit Mängeln, Zählerständen, Schlüsseln; Abschluss setzt Übergabe/Abnahme und Gewährleistung |
| `GET/POST /api/mangelvorlagen`, `POST /api/mangelvorlagen/standard`, `PUT/DELETE /api/mangelvorlagen/:id` | Standardmängel-Katalog |
| `GET /api/auswertungen/mabv-pruefbericht?gesellschaftId=&von=&bis=` | Prüfhilfe nach § 16 MaBV mit Feststellungen je Kaufvertrag (auch `format=xlsx`) |
| `GET/POST /api/eingangsrechnungen`, `GET /api/eingangsrechnungen/:id?zahlungsdatum=`, `POST …/:id/pruefen`, `…/freigeben`, `…/zahlung` | Rechnungseingangsbuch und Workflow Prüfen → Freigeben → Zahlen (Skontofrist, Bauabzugsteuer) |

Alle schreibenden Aufrufe werden mit Benutzer, Zeitpunkt und alt → neu protokolliert. Bis zur Microsoft-Anmeldung
wird der Benutzer übergangsweise aus dem Header `x-benutzer` gelesen.

## Produktivbetrieb

Die Plattform läuft als Docker-Stack auf einem vServer (geplant: **projectx.cubivivit.de**). Schritt für Schritt in
[docs/deployment.md](docs/deployment.md); kurz:

```bash
cp .env.prod.example .env.prod   # ausfüllen
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
./deploy/update.sh               # spätere Updates (inkl. Sicherung vorab)
```

## MCP-Server

```bash
pnpm --filter @bt/mcp build
# lokal (z. B. Claude Desktop): Befehl `node apps/mcp/dist/index.js`, Umgebungsvariable DATABASE_URL
# als HTTP-Endpunkt:
DATABASE_URL=... node apps/mcp/dist/index.js --http   # http://localhost:3002/mcp
```

Tools: `mabv_ratenplan_berechnen`, `handwerker_pruefkette`, `projekte_auflisten`, `offene_zahlungsanforderungen`
(direkt aus der Datenbank, wenn `DATABASE_URL` gesetzt ist) sowie `anforderbare_raten`, `kostenstand`, `maengel_offen`, `liquiditaet`, `liquiditaetsplan`, `buergschaften` `mabv_pruefbericht` und `aufgaben` (über die REST-API, wenn
`API_URL` gesetzt ist – dort gelten dieselben Prüfregeln wie in der Oberfläche).

Dokumente werden lokal unter `DOKUMENTE_PFAD` (Standard `data/dokumente`) abgelegt; eine S3-Ablage kann über die
Schnittstelle `Speicher` ergänzt werden.
Der HTTP-Endpunkt hat noch keine Authentifizierung – vor jedem Betrieb außerhalb von localhost OAuth ergänzen.

## Wichtige Hinweise

- **Geldbeträge** nie als JavaScript-`number` rechnen: in der DB `numeric(14,2)`, im Code `Money` aus `@bt/domain`.
- **DATEV-EXTF-Format:** Kopfzeile und Spaltenpositionen (1–39) vor dem Produktiveinsatz gegen die offizielle
  DATEV-Formatbeschreibung prüfen und mit dem Steuerberater einen Testimport machen.
- **SEPA-Datei** (pain.001.001.09 nach DK-Spezifikation): vor dem Produktiveinsatz einmal im Onlinebanking der Hausbank
  testen; das XSD-Schema ist im Testlauf nicht eingebunden.
- **Steuer- und MaBV-Logik** ist mit Testfällen abgesichert, ersetzt aber keine fachliche Prüfung durch Steuerberater
  bzw. Fachanwalt.

## Nächste Schritte (Roadmap Phase 0/1)

1. Login über Microsoft Entra ID mit App-Rollen (wartet auf die [App-Registrierung](docs/microsoft-entra-app-registrierung.md))
2. ~~Masken: Geschäftspartner, Projekte, Einheiten~~ ✓
3. ~~Dokumentablage an Projekten, Einheiten, Partnern und Kaufverträgen~~ ✓
4. ~~Kaufverträge mit Ratenplan, Bautenstand, Zahlungsanforderungen, offene Posten~~ ✓ – offen: Mahnwesen, Zusatzleistungen/Gutschriften, Versand per Outlook
5. ~~Gewerke, Handwerkerverträge, Eingangsrechnungen mit Freigabe-Workflow~~ ✓ – SEPA-Zahlungslauf (pain.001.001.09) und Bürgschaften ✓; offen: Rollen für Prüfung/Freigabe, Bauabzugsteuer-Anmeldung
6. ~~Mängelverwaltung mit Fotos, Rügen und Fristen~~ ✓ – Standardmängel-Katalog und Abnahmeprotokolle ✓
7. ~~Mahnwesen für den Verkauf~~ ✓ – Verzugsbeginn (Tag nach Fälligkeit) und Mahntexte bitte juristisch prüfen lassen
8. ~~Auswertungen: Liquidität, Controlling, Kostenreport, Projektbericht (Bildschirm, PDF, Excel)~~ ✓ – MaBV-Prüfbericht (§ 16) ✓
9. ~~Bauzeitenplan (Gantt, MaBV-Meilensteine) und Liquiditätsplan nach Kalenderwochen~~ ✓ – offen: Abhängigkeiten zwischen Vorgängen, Einbehalte im Liquiditätsplan
10. Buchungsjournal automatisch aus Verkauf und Kosten befüllen
