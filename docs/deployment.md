# Deployment auf dem vServer (projectx.cubivivit.de)

Die Plattform läuft als Docker-Stack. Öffentlich erreichbar ist nur **Caddy** auf Port 80/443. Caddy besorgt das
HTTPS-Zertifikat automatisch bei Let's Encrypt und schützt die Seite vorerst mit einem Passwort. API, Weboberfläche und
Datenbank laufen in einem internen Docker-Netz.

```
Internet ──443──▶ Caddy (HTTPS, Passwortschutz) ──▶ Web (Next.js) ──▶ API (NestJS) ──▶ PostgreSQL
                                                                          └──▶ Dokumente (Volume)
                  Backup-Dienst: täglich pg_dump + Dokumente → ./backups
```

**Dauer:** ca. 30 Minuten · **Benötigt:** SSH-Zugang zum Server, Zugriff auf die DNS-Einstellungen von cubivivit.de

---

## 1. Server-Voraussetzungen

| | Minimum | Empfohlen |
| --- | --- | --- |
| Betriebssystem | Ubuntu 22.04/24.04 oder Debian 12 | Ubuntu 24.04 LTS |
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Speicher | 40 GB SSD | 80 GB SSD |

4 GB RAM werden vor allem beim Bauen der Images gebraucht; im Betrieb genügen ca. 1,5 GB.

## 2. DNS-Eintrag

Beim DNS-Anbieter von cubivivit.de einen **A-Eintrag** anlegen:

| Name | Typ | Wert |
| --- | --- | --- |
| `projectx` | A | IPv4-Adresse des Servers |

(Optional zusätzlich ein AAAA-Eintrag für IPv6.) Prüfen: `dig +short projectx.cubivivit.de` muss die Server-IP liefern.

## 3. Server vorbereiten

Per SSH als Benutzer mit sudo-Rechten anmelden:

```bash
# System aktualisieren und automatische Sicherheitsupdates einschalten
sudo apt update && sudo apt -y upgrade
sudo apt -y install git unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Docker installieren (offizielles Skript von Docker)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden

# Firewall: nur SSH, HTTP und HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

> Hinweis: Docker veröffentlicht Ports an ufw vorbei. Im Stack veröffentlicht aber nur Caddy Ports (80/443) –
> Datenbank und API sind bewusst ohne `ports:` konfiguriert.

## 4. Code auf den Server holen

Das Repository ist privat. Am einfachsten mit einem **Deploy Key** (nur Lesezugriff):

```bash
ssh-keygen -t ed25519 -C "deploy projectx" -f ~/.ssh/bautraeger_deploy -N ""
cat ~/.ssh/bautraeger_deploy.pub
```

Den angezeigten Schlüssel auf GitHub eintragen: Repository **djmarcelmc/bautraeger-plattform → Settings → Deploy keys →
Add deploy key** (Haken bei „Allow write access“ **nicht** setzen). Dann:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-bautraeger
  HostName github.com
  IdentityFile ~/.ssh/bautraeger_deploy
EOF
git clone git@github-bautraeger:djmarcelmc/bautraeger-plattform.git
cd bautraeger-plattform
```

Solange die Pull Requests noch nicht gemergt sind, den Branch mit dem Deployment auschecken:
`git checkout claude/deployment` (nach dem Merge: `git checkout main`).

## 5. Konfiguration

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod

# Datenbank-Passwort erzeugen und in .env.prod bei POSTGRES_PASSWORD eintragen
openssl rand -base64 32

# Passwort-Hash für den Zugangsschutz erzeugen und bei BASIC_AUTH_HASH eintragen (in einfachen Anführungszeichen!)
docker run --rm caddy:2 caddy hash-password --plaintext 'Ein-langes-Passwort'
nano .env.prod
```

`DOMAIN` (projectx.cubivivit.de) und `ACME_EMAIL` prüfen. Das Klartext-Passwort sicher (Passwortmanager) an die
Nutzer weitergeben.

## 6. Starten

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Der erste Build dauert ca. 3–6 Minuten. Danach **https://projectx.cubivivit.de** öffnen: Es erscheint die
Passwortabfrage (Benutzer `bautraeger`), anschließend die Übersicht. Datenbank-Migrationen laufen beim Start der API
automatisch.

Erste Schritte in der Oberfläche: Gesellschaft (mit DATEV-Nummern) anlegen → Projekt → Einheiten → Geschäftspartner.

## 6a. E-Mail-Benachrichtigungen (optional)

Die Plattform verschickt Benachrichtigungen (neue Mängelanzeigen an die Bauleitung, Eingangs- und Statusmeldungen an
Käufer, tägliche Aufgabenübersicht um 7 Uhr). Ohne Konfiguration landen sie nur im **Postausgang** (Einstellungen →
Benachrichtigungen). Für den Versand in `.env.prod` eintragen und `docker compose … up -d` ausführen:

| Variante | Variablen | Hinweis |
| --- | --- | --- |
| **Microsoft 365 (Outlook)** | `MAIL_ABSENDER`, `MAIL_GRAPH_TENANT`, `MAIL_GRAPH_CLIENT_ID`, `MAIL_GRAPH_SECRET` | App-Berechtigung *Mail.Send*, auf das Absender-Postfach beschränkt (siehe [Entra-Anleitung](microsoft-entra-app-registrierung.md)); gesendete Mails liegen in „Gesendete Elemente“ |
| SMTP | `MAIL_ABSENDER`, `MAIL_SMTP_URL` | z. B. `smtp://benutzer:passwort@smtp.example.de:587` |

Danach unter **Einstellungen → Benachrichtigungen** die Empfänger eintragen und eine Testnachricht senden.
Fehlgeschlagene Sendungen werden automatisch wiederholt (nach 1, 5, 30 Minuten, 2 und 12 Stunden) und im Postausgang
mit Fehlertext angezeigt.

Danach geht es mit der [Checkliste zur Inbetriebnahme](inbetriebnahme.md) weiter (Grundeinstellungen,
Datenübernahme, Abgleich).


**Schreiben per E-Mail:** Mit eingerichtetem Versand lassen sich Zahlungsanforderungen, Mahnungen und Sonderwunsch-Angebote
direkt aus der Druckansicht als PDF an die Käufer senden („Per E-Mail senden“). Das PDF erzeugt der Web-Container mit
Chromium (im Image enthalten, `CHROMIUM_PFAD=/usr/bin/chromium`); es wird zusätzlich am Kaufvertrag unter
„Schriftverkehr“ abgelegt. Microsoft 365 nimmt Anhänge bis 3 MB pro Nachricht an – die Schreiben liegen bei rund 120 KB.

## 7. Updates

```bash
cd ~/bautraeger-plattform
./deploy/update.sh
```

Das Skript erstellt zuerst eine Sicherung, holt den neuen Stand, baut neu und startet die Dienste.

## 8. Sicherungen

- Täglich (und vor jedem Update) im Ordner `~/bautraeger-plattform/backups`:
  `db_<Datum>.dump` (Datenbank) und `dokumente_<Datum>.tar.gz` (alle Dateien); Aufbewahrung `BACKUP_TAGE` (14 Tage).
- **Wichtig:** Sicherungen zusätzlich außerhalb des Servers ablegen, z. B. täglich per `rsync` auf eine Hetzner
  Storage Box oder ein NAS. Fällt der Server aus, sind sonst auch die Sicherungen weg.
- Sofort sichern: `docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm -e BACKUP_EINMAL=1 backup`

**Wiederherstellen** (überschreibt die aktuelle Datenbank – vorher sichern!):

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C stop api web
$C exec -T db pg_restore -U bt -d bautraeger --clean --if-exists < backups/db_2026-10-18_0300.dump
docker run --rm -v bautraeger_dokumente:/data/dokumente -v "$PWD/backups:/b" postgres:16 \
  sh -c "rm -rf /data/dokumente/* && tar -xzf /b/dokumente_2026-10-18_0300.tar.gz -C /data"
$C start api web
```

## 9. Betrieb & Fehlersuche

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C ps                 # Status aller Dienste
$C logs -f caddy      # Zertifikat / Zugriffe
$C logs -f api        # Fehler der API
$C restart web        # einzelnen Dienst neu starten
```

| Problem | Ursache / Lösung |
| --- | --- |
| Zertifikat wird nicht ausgestellt | DNS zeigt noch nicht auf den Server oder Port 80/443 ist gesperrt → `dig`, Firewall des Hosters prüfen, `logs caddy` |
| Passwortabfrage akzeptiert nichts | Hash in `.env.prod` nicht in einfachen Anführungszeichen → korrigieren, `up -d` |
| Seite meldet „API nicht erreichbar“ | `logs api` – meist falsches `POSTGRES_PASSWORD` nach Änderung (Volume behält das alte Passwort) |

## 10. Sicherheit

- Der Passwortschutz ist eine **Übergangslösung**. Die Anmeldung mit Microsoft-Konten und Rollen ist eingebaut und wird
  per Konfiguration eingeschaltet – Schritte und Rechtematrix in der [Entra-Anleitung](microsoft-entra-app-registrierung.md#7-umstellung-in-der-plattform-durch-den-betreiber).
  Umleitungs-URI in Entra: `https://projectx.cubivivit.de/api/auth/callback/microsoft-entra-id`
- Bis dahin keine echten personenbezogenen Daten von Kunden einpflegen, ohne dass ein AV-Vertrag mit dem Hoster besteht
  (DSGVO) – Testdaten sind unkritisch.
- `.env.prod` nie ins Repository einchecken (ist in `.gitignore`).
- **Käuferportal** (`/portal/…`): bewusst ohne Passwort erreichbar, damit Käufer Mängel über ihren persönlichen Link
  melden können. Geschützt durch einen zufälligen Token je Kaufvertrag (gespeichert nur als SHA-256), Ablaufdatum,
  Widerruf, höchstens 10 Meldungen je Link und Tag und eine Prüfung der Fotos auf echte Bildformate. Caddy und die
  Weboberfläche blockieren auf diesem Pfad interne Server-Aktionen. Alle anderen Seiten bleiben passwortgeschützt.
