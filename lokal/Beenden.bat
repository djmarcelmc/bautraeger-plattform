@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo  Bautraeger-Plattform wird beendet (die Daten bleiben erhalten) ...
docker compose -f docker-compose.lokal.yml stop
echo  Beendet.
timeout /t 5 >nul
