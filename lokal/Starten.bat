@echo off
chcp 65001 >nul
title Bautraeger-Plattform
cd /d "%~dp0.."
echo.
echo  Bautraeger-Plattform wird gestartet ...
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker Desktop laeuft nicht.
  echo  Bitte Docker Desktop starten ^(Startmenue^), warten bis unten links "Engine running" steht,
  echo  und dann diese Datei noch einmal doppelklicken.
  echo.
  pause
  exit /b 1
)
echo  Beim ersten Start werden die Programmteile gebaut - das dauert 5 bis 15 Minuten.
echo  Spaeter startet die Plattform in wenigen Sekunden.
echo.
docker compose -f docker-compose.lokal.yml up -d --build
if errorlevel 1 (
  echo.
  echo  Beim Starten ist ein Fehler aufgetreten - bitte einen Screenshot dieses Fensters machen.
  pause
  exit /b 1
)
echo.
echo  Warte, bis die Plattform bereit ist ...
for /l %%i in (1,1,60) do (
  curl.exe -s -o nul http://localhost:3000/ && goto bereit
  timeout /t 5 /nobreak >nul
)
echo  Die Plattform antwortet noch nicht. Bitte in einer Minute http://localhost:3000 im Browser oeffnen.
pause
exit /b 0
:bereit
echo  Fertig! Die Plattform oeffnet sich im Browser: http://localhost:3000
start "" http://localhost:3000
echo.
echo  Zum Beenden: "Beenden.bat" doppelklicken. Dieses Fenster kann geschlossen werden.
timeout /t 15 >nul
