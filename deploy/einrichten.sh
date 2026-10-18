#!/bin/bash
# Ersteinrichtung auf einem frischen Ubuntu-Server (24.04/22.04) – erledigt die Schritte 3, 5 und 6 aus
# docs/deployment.md automatisch: Systempakete, Docker, Firewall, .env.prod mit zufälligen Passwörtern, Start.
#
# Aufruf im Projektordner:   ./deploy/einrichten.sh
# Andere Adresse:            DOMAIN=plattform.example.de ./deploy/einrichten.sh
# Nur Konfiguration anlegen: ./deploy/einrichten.sh --nur-konfiguration
#
# Mehrfach ausführbar: eine vorhandene .env.prod wird nicht überschrieben.
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-projectx.cubivivit.de}"
ACME_EMAIL="${ACME_EMAIL:-admin@cubivivit.de}"
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

schritt() { printf '\n\033[1;34m== %s\033[0m\n' "$1"; }
hinweis() { printf '\033[0;33m%s\033[0m\n' "$1"; }

docker_befehl() {
  # Direkt nach der Installation ist der Benutzer noch nicht in der Gruppe „docker“ → dann über sudo
  if docker info >/dev/null 2>&1; then echo "docker"; else echo "$SUDO docker"; fi
}

system_vorbereiten() {
  schritt "1/5 System aktualisieren und Pakete installieren"
  $SUDO apt-get update -q
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get -y -q upgrade
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get -y -q install git curl openssl ufw unattended-upgrades dnsutils
  $SUDO dpkg-reconfigure -f noninteractive -plow unattended-upgrades
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | $SUDO sh
    [ -n "$SUDO" ] && $SUDO usermod -aG docker "$USER"
  else
    echo "Docker ist bereits installiert."
  fi

  schritt "2/5 Firewall: nur SSH, HTTP und HTTPS"
  $SUDO ufw allow OpenSSH >/dev/null
  $SUDO ufw allow 80/tcp >/dev/null
  $SUDO ufw allow 443/tcp >/dev/null
  $SUDO ufw allow 443/udp >/dev/null
  $SUDO ufw --force enable
}

# Wert in .env.prod setzen (Werte enthalten nur Zeichen ohne Sonderbedeutung für sed mit „|“)
setzen() { sed -i "s|^$1=.*|$1=$2|" .env.prod; }

konfiguration() {
  schritt "3/5 Konfiguration (.env.prod)"
  if [ -f .env.prod ]; then
    echo ".env.prod ist schon vorhanden – bleibt unverändert."
    return
  fi
  local d dbpw zugang hash
  d="$(docker_befehl)"
  dbpw="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)"
  zugang="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
  hash="$($d run --rm caddy:2 caddy hash-password --plaintext "$zugang" 2>/dev/null ||
    $d run --rm mirror.gcr.io/library/caddy:2 caddy hash-password --plaintext "$zugang")"
  cp .env.prod.example .env.prod
  chmod 600 .env.prod
  setzen DOMAIN "$DOMAIN"
  setzen ACME_EMAIL "$ACME_EMAIL"
  setzen POSTGRES_PASSWORD "$dbpw"
  setzen BASIC_AUTH_HASH "'$hash'"
  # Klartext-Zugangspasswort nur für den Administrator lesbar ablegen (für die Weitergabe an die Nutzer)
  umask 077
  printf 'Adresse:  https://%s\nBenutzer: bautraeger\nPasswort: %s\n' "$DOMAIN" "$zugang" > zugang.txt
  echo "Zufällige Passwörter erzeugt, Zugangsdaten in zugang.txt abgelegt."
}

dns_pruefen() {
  schritt "4/5 DNS prüfen"
  local dns ip
  dns="$(dig +short "$DOMAIN" A | tail -1)"
  ip="$(curl -s -4 --max-time 10 ifconfig.me || true)"
  echo "$DOMAIN zeigt auf: ${dns:-(noch nichts)} · Server-IP: ${ip:-(unbekannt)}"
  if [ -z "$dns" ] || [ "$dns" != "$ip" ]; then
    hinweis "Der DNS-Eintrag zeigt (noch) nicht auf diesen Server. Die Plattform startet trotzdem;"
    hinweis "das HTTPS-Zertifikat holt Caddy automatisch, sobald der Eintrag verteilt ist (meist 5–30 Minuten)."
  fi
}

starten() {
  schritt "5/5 Images bauen und starten (dauert beim ersten Mal 3–6 Minuten)"
  local d
  d="$(docker_befehl)"
  $d compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
  echo "Warte, bis alle Dienste bereit sind …"
  for _ in $(seq 1 60); do
    if $d compose -f docker-compose.prod.yml --env-file .env.prod ps --format '{{.Service}} {{.Status}}' | grep -q '^caddy .*Up'; then break; fi
    sleep 5
  done
  $d compose -f docker-compose.prod.yml --env-file .env.prod ps
}

if [ "${1:-}" = "--nur-konfiguration" ]; then
  konfiguration
  exit 0
fi

system_vorbereiten
konfiguration
dns_pruefen
starten

schritt "Fertig"
cat zugang.txt 2>/dev/null || true
echo
echo "Zugangsdaten sicher aufbewahren (Passwortmanager) und die Datei danach löschen:  rm zugang.txt"
echo "Status:  docker compose -f docker-compose.prod.yml --env-file .env.prod ps"
echo "Updates: ./deploy/update.sh"
