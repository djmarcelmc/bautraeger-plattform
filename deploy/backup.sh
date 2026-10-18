#!/bin/sh
# Tägliche Sicherung: Datenbank (pg_dump) und Dokumente (tar). Aufbewahrung: BACKUP_TAGE (Standard 14).
# Einmalige Sicherung (z. B. vor einem Update): BACKUP_EINMAL=1
set -eu
TAGE="${BACKUP_TAGE:-14}"
mkdir -p /backups
# Beim ersten Start warten, bis die API die Datenbank angelegt hat (sonst wäre die erste Sicherung leer)
for i in $(seq 1 60); do
  [ "$(psql -Atc "select to_regclass('drizzle.__drizzle_migrations') is not null" 2>/dev/null)" = "t" ] && break
  echo "[$(date -Iseconds)] warte auf die Datenbank-Migrationen …"
  sleep 10
done
while true; do
  STEMPEL=$(date +%Y-%m-%d_%H%M)
  echo "[$(date -Iseconds)] Sicherung $STEMPEL startet"
  pg_dump --format=custom --file="/backups/db_$STEMPEL.dump"
  tar -czf "/backups/dokumente_$STEMPEL.tar.gz" -C /data dokumente
  find /backups -name 'db_*.dump' -mtime +"$TAGE" -delete
  find /backups -name 'dokumente_*.tar.gz' -mtime +"$TAGE" -delete
  echo "[$(date -Iseconds)] Sicherung $STEMPEL fertig"
  [ "${BACKUP_EINMAL:-0}" = "1" ] && exit 0
  sleep "${BACKUP_INTERVALL_SEKUNDEN:-86400}"
done
