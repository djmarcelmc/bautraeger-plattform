#!/bin/sh
# Aktualisiert die Plattform auf dem Server: Sicherung → neuer Code → neu bauen → neu starten.
# Aufruf im Projektordner:  ./deploy/update.sh
set -eu
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

echo "1/4 Sicherung vor dem Update …"
$COMPOSE run --rm -e BACKUP_EINMAL=1 backup

echo "2/4 Neuen Stand holen …"
git pull --ff-only

echo "3/4 Images bauen …"
$COMPOSE build

echo "4/4 Neu starten (Migrationen laufen automatisch) …"
$COMPOSE up -d
docker image prune -f >/dev/null
$COMPOSE ps
