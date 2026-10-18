# Bauträger-Plattform auf dem eigenen PC

Zum Ausprobieren und Kennenlernen – läuft nur auf diesem PC (http://localhost:3000), ohne Passwort.
Für den gemeinsamen Betrieb im Team ist der Server gedacht (`docs/deployment.md`).

## Einmalig: Docker Desktop installieren

1. https://www.docker.com/products/docker-desktop/ → **Download for Windows** (bzw. Mac).
2. Installer ausführen, Standardeinstellungen übernehmen, PC neu starten, wenn gefragt.
3. **Docker Desktop** aus dem Startmenü öffnen, Bedingungen akzeptieren, Anmeldung überspringen
   („Continue without signing in“). Warten, bis unten links **Engine running** steht.

## Starten

- Ordner `bautraeger-plattform` aus der ZIP-Datei entpacken (z. B. nach *Dokumente*).
- Im Ordner `lokal` doppelt auf **Starten.bat** klicken.
- Beim **ersten** Start werden die Programmteile gebaut (**5–15 Minuten**, Internet nötig). Danach öffnet sich
  der Browser mit http://localhost:3000. Später dauert der Start nur Sekunden.
- Mac/Linux: `lokal/starten.sh` im Terminal ausführen.

## Beenden

Doppelklick auf **Beenden.bat**. Die eingegebenen Daten bleiben erhalten und sind beim nächsten Start wieder da.

## Erste Schritte in der Plattform

Links im Menü **Inbetriebnahme** öffnen – die Seite zeigt Punkt für Punkt, was einzurichten ist
(Gesellschaft, Projekt, Einheiten, Geschäftspartner …).

## Gut zu wissen

- E-Mails werden lokal **nicht** verschickt, sondern nur im Postausgang protokolliert (Einstellungen →
  Benachrichtigungen).
- Alles komplett löschen und neu anfangen: im Ordner `bautraeger-plattform` eine Eingabeaufforderung öffnen und
  `docker compose -f docker-compose.lokal.yml down -v` ausführen.
- Meldung „Docker Desktop läuft nicht“: Docker Desktop starten, auf *Engine running* warten, erneut doppelklicken.
