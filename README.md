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
| `GET/POST/PUT/DELETE /api/gesellschaften/:id/briefbogen`, `GET …/briefbogen/datei` | Briefbogen je Gesellschaft (PDF, Satzspiegel, Felder für Datum/Zeichen) – Schreiben und PDFs werden darauf gesetzt |
| `GET /api/partner?suche=&rolle=`, `GET /api/partner/naechste-nr`, `POST`, `GET/PUT /api/partner/:id` | Geschäftspartner |
| `GET /api/projekte?suche=&abgeschlossen=nein\|ja\|alle`, `GET /api/projekte/naechste-nr?gesellschaftId=` | Projektliste, Nummernvorschlag |
| `POST /api/projekte`, `GET/PUT /api/projekte/:id`, `POST /api/projekte/:id/kopieren` | Projekt anlegen, lesen (inkl. Einheiten), ändern, kopieren |
| `POST /api/projekte/:id/einheiten`, `GET/PUT/DELETE /api/einheiten/:id` | Einheiten |
| `GET /api/protokoll/:datensatzId` | Änderungsprotokoll (GoBD) |
| `GET /api/import/:art/vorlage`, `POST /api/import/:art/pruefen`, `POST /api/import/:art/ausfuehren` | Datenimport aus Excel/CSV für `partner` und `einheiten` (Prüflauf ohne Speichern, Übernahme ganz oder gar nicht) |
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
| `GET/POST /api/projekte/:id/bauzeitenplan`, `POST …/bauzeitenplan/verschieben`, `POST /api/projekte/:id/vorgaenge`, `PUT/DELETE /api/vorgaenge/:id` | Bauzeitenplan: Vorlage (25 Vorgänge mit Abhängigkeiten, alle MaBV-Meilensteine), Vorgänge mit Gewerken und Vorgängern (Nachfolger rücken bei Verzug automatisch nach, Zirkelbezüge werden abgewiesen), kritischer Pfad, Plan verschieben |
| `GET /api/auswertungen/liquiditaetsplan?projektId=&wochen=&anfangsbestand=&unverkauft=1&skonto=0&stichtag=` | Liquiditätsplan nach Kalenderwochen; Kosten nach Prüfkette der Verträge (Nachlass, Umlagen, Einbehalte, Skonto), Schlusszahlungen und Gewährleistungseinbehalte (auch `format=xlsx`) |
| `GET /api/zahlungslaeufe/vorschlag?ausfuehrungAm=`, `POST /api/zahlungslaeufe`, `GET /api/zahlungslaeufe[/:id]`, `GET …/:id/xml` | Zahlungsvorschlag, Zahlungslauf mit Verbuchung, SEPA-Datei (pain.001.001.09); IBAN-Prüfung gegen Bankdatenbetrug (in den letzten 30 Tagen geänderte IBAN, abweichende IBAN auf der Rechnung, erste Zahlung an eine neue IBAN → Bestätigung nötig; wer die IBAN geändert hat, darf den Lauf nicht erstellen); dokumentierter Rückruf (`GET /api/partner/:id/iban`, `POST …/iban/rueckruf`) gilt als Bestätigung, offene Rückrufe erscheinen im Cockpit |
| `GET /api/sonderwuensche?projektId=&status=`, `POST /api/kaufvertraege/:id/sonderwuensche`, `GET/PUT/DELETE /api/sonderwuensche/:id`, `POST …/:id/beauftragen`, `…/ablehnen`, `…/zuruecksetzen` | Sonderwünsche und Gutschriften: Angebot, Beauftragung legt eine Rate an (sofort oder mit einem MaBV-Abschnitt anforderbar), Gutschriften werden mit der Anforderung verrechnet |
| `GET /api/schreiben/:art/:id`, `POST /api/schreiben/:art/:id/versenden`, Sammelversand: `GET /api/schreiben/:art?ids=`, `POST …/:id/versenden-standard` | Zahlungsanforderung, Mahnung oder Sonderwunsch-Angebot als PDF per E-Mail an die Käufer (Vorschlag für Empfänger und Text, Ablage am Kaufvertrag unter „Schriftverkehr“, Versandvermerk) |
| `GET /api/bauabzug?monate=`, `GET /api/bauabzug/beleg?gesellschaftId=&handwerkerId=&monat=`, `POST /api/bauabzug/anmeldungen`, `DELETE /api/bauabzug/anmeldungen/:id` | Bauabzugsteuer (§ 48a EStG): Monatsübersicht je Handwerker mit Termin, Abrechnungsbeleg und Angaben für die Anmeldung, Erfassung von Anmeldung/Abführung |
| `POST /api/bankabgleich/import`, `GET /api/bankabgleich?gesellschaftId=&status=`, `POST /api/bankabgleich/vorschlaege`, `POST /api/bankabgleich/umsaetze/:id/zuordnen\|ignorieren\|zuruecksetzen` | Bankabgleich: Kontoauszug (CAMT.053/052/054, MT940) einlesen (Gesellschaft über IBAN, doppelte Umsätze werden erkannt), Vorschläge über Rechnungsnummer, Kaufvertrag, Betrag/Name bzw. EndToEnd-ID und Zahlungslauf; Zuordnung verbucht Zahlungseingänge (auch auf mehrere Anforderungen) und bestätigt Zahlungen an Handwerker |
| `GET/POST /api/rechnungseingang`, `POST /api/rechnungseingang/abrufen`, `POST /api/rechnungseingang/:id/erfassen\|verwerfen\|wiederherstellen` | Rechnungseingang: Rechnungen per Upload oder aus dem Rechnungspostfach (Microsoft 365, alle 10 Minuten); XRechnung (CII/UBL) und ZUGFeRD/Factur-X werden ausgelesen, sonst der PDF-Text; Vorschlag für Handwerker (IBAN, Steuernummer, Absender, Name) und Vertrag (Bauvorhaben im Text); Erfassen legt die Eingangsrechnung mit angehängter Datei an; unbekannte Handwerker und fehlende Verträge direkt aus dem Eingang anlegen (vorbelegt aus der Rechnung), Warnung bei abweichender IBAN |
| `GET /api/buchhaltung/journal?gesellschaftId=&von=&bis=&status=neu\|exportiert&quelle=`, `POST /api/buchhaltung/abgleich`, `POST /api/buchhaltung/export`, `GET /api/buchhaltung/stapel[/:stapel]`, `GET /api/buchhaltung/belege?gesellschaftId=&stapel=`, `GET/POST /api/buchhaltung/saldenliste?gesellschaftId=&stichtag=`, `GET/PUT/DELETE /api/buchhaltung/kontierung/:gesellschaftId` | Buchungsjournal: wird automatisch aus Zahlungsanforderungen (bis zur Übergabe auf Erhaltene Anzahlungen, danach auf Erlöse), Übergaben (Umbuchung der Anzahlungen auf Erlöse), Zahlungseingängen, freigegebenen Rechnungen, Zahlungen (inkl. Skonto und Bauabzugsteuer) und abgeführter Bauabzugsteuer befüllt; DATEV-Buchungsstapel (EXTF) schreibt die Buchungen fest, spätere Änderungen werden storniert und neu gebucht; Kontenzuordnung je Gesellschaft; DATEV-Paket als ZIP mit Belegen (versandte bzw. erzeugte Zahlungsanforderungen, Rechnungsscans, Bauabzug-Abrechnungsbelege) und Belegliste, frühere Stapel erneut herunterladbar; Saldenliste der Personenkonten mit OP-Abgleich und Vergleich gegen die DATEV-Saldenliste (CSV), auch als Excel (`format=xlsx`) |
| `GET/POST /api/buergschaften?status=offen\|handlung&richtung=`, `GET/PUT/DELETE /api/buergschaften/:id` | Bürgschaften (erhalten/§ 7 MaBV) mit Ablauf- und Rückgabeüberwachung |
| `GET /api/abnahmen?projektId=`, `POST /api/projekte/:id/abnahmen`, `GET/PUT/DELETE /api/abnahmen/:id`, `POST …/:id/maengel`, `POST …/:id/abschliessen` | Abnahmen (Sondereigentum, Gemeinschaftseigentum, Handwerker) mit Mängeln, Zählerständen, Schlüsseln; Abschluss setzt Übergabe/Abnahme und Gewährleistung |
| `GET/POST /api/mangelvorlagen`, `POST /api/mangelvorlagen/standard`, `PUT/DELETE /api/mangelvorlagen/:id` | Standardmängel-Katalog |
| `GET /api/auswertungen/mabv-pruefbericht?gesellschaftId=&von=&bis=` | Prüfhilfe nach § 16 MaBV mit Feststellungen je Kaufvertrag (auch `format=xlsx`) |
| `GET/POST /api/eingangsrechnungen`, `GET /api/eingangsrechnungen/:id?zahlungsdatum=`, `POST …/:id/pruefen`, `…/freigeben`, `…/zahlung` | Rechnungseingangsbuch und Workflow Prüfen → Freigeben → Zahlen (Skontofrist, Bauabzugsteuer); Abgleich mit dem Auftrag inkl. beauftragter Nachträge (ab 90 % Hinweis, Überschreitung nur mit protokollierter Bestätigung freigebbar) |

Alle schreibenden Aufrufe werden mit Benutzer, Zeitpunkt und alt → neu protokolliert. Mit eingeschalteter
Microsoft-Anmeldung (`AUTH_AKTIV=true`) übergibt die Weboberfläche Benutzer und Rollen (`x-benutzer`, `x-rollen`), und
die API prüft jedes Kommando gegen die Rechte der Rolle (Rechtematrix in der Entra-Anleitung, inkl. Vier-Augen-Prinzip
bei der Rechnungsfreigabe). Ohne Anmeldung läuft die Plattform wie bisher hinter dem Passwortschutz.

## Produktivbetrieb

Für den ersten echten Betrieb mit Datenübernahme gibt es eine Checkliste: [docs/inbetriebnahme.md](docs/inbetriebnahme.md).

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
(direkt aus der Datenbank, wenn `DATABASE_URL` gesetzt ist) sowie `anforderbare_raten`, `kostenstand`, `maengel_offen`, `liquiditaet`, `liquiditaetsplan`, `buergschaften`, `bauabzugsteuer`, `buchungsjournal`, `sonderwuensche`, `mabv_pruefbericht` und `aufgaben` (über die REST-API, wenn
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

1. ~~Login über Microsoft Entra ID mit App-Rollen~~ ✓ eingebaut, wird mit den Daten der [App-Registrierung](docs/microsoft-entra-app-registrierung.md) eingeschaltet
2. ~~Masken: Geschäftspartner, Projekte, Einheiten~~ ✓ – Datenimport aus Excel/CSV ✓
3. ~~Dokumentablage an Projekten, Einheiten, Partnern und Kaufverträgen~~ ✓
4. ~~Kaufverträge mit Ratenplan, Bautenstand, Zahlungsanforderungen, offene Posten~~ ✓ – Mahnwesen ✓, Sonderwünsche/Gutschriften ✓, Versand der Schreiben als PDF per E-Mail (Outlook/SMTP) ✓
5. ~~Gewerke, Handwerkerverträge, Eingangsrechnungen mit Freigabe-Workflow~~ ✓ – SEPA-Zahlungslauf (pain.001.001.09) und Bürgschaften ✓; Rollen für Prüfung/Freigabe ✓, Bauabzugsteuer-Anmeldung mit Abrechnungsbeleg ✓
6. ~~Mängelverwaltung mit Fotos, Rügen und Fristen~~ ✓ – Standardmängel-Katalog und Abnahmeprotokolle ✓
7. ~~Mahnwesen für den Verkauf~~ ✓ – Verzugsbeginn (Tag nach Fälligkeit) und Mahntexte bitte juristisch prüfen lassen
8. ~~Auswertungen: Liquidität, Controlling, Kostenreport, Projektbericht (Bildschirm, PDF, Excel)~~ ✓ – MaBV-Prüfbericht (§ 16) ✓
9. ~~Bauzeitenplan (Gantt, MaBV-Meilensteine) und Liquiditätsplan nach Kalenderwochen~~ ✓ – Abhängigkeiten und kritischer Pfad ✓, Einbehalte und Skonto im Liquiditätsplan ✓
10. ~~Buchungsjournal automatisch aus Verkauf und Kosten befüllen~~ ✓ – DATEV-Export mit Festschreibung und Storno, Umbuchung auf Erlöse bei Übergabe, Kontenzuordnung je Gesellschaft (mit Steuerberater abstimmen); Bankabgleich mit CAMT.053/MT940 ✓, eigene DATEV-Personenkonten am Geschäftspartner ✓, Belege im DATEV-Paket ✓, Cockpit-Hinweise zu Bankabgleich, DATEV-Export und fehlenden Rechnungsscans ✓, Saldenliste & OP-Abgleich (auch gegen DATEV) ✓, Rechnungseingang per Postfach/Upload mit E-Rechnung (XRechnung/ZUGFeRD) ✓
