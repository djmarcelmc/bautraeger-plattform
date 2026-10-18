#!/bin/sh
# Mac/Linux: Bauträger-Plattform lokal starten (Docker Desktop muss laufen)
cd "$(dirname "$0")/.." || exit 1
docker compose -f docker-compose.lokal.yml up -d --build || exit 1
echo "Warte, bis die Plattform bereit ist …"
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000/ && break; sleep 5; done
echo "Fertig: http://localhost:3000"
(command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true
