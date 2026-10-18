# Inbetriebnahme und Datenübernahme

Checkliste für den Wechsel von AMADEUS X (oder Excel-Listen) auf die Bauträger-Plattform. Die Reihenfolge ist so
gewählt, dass jeder Schritt auf dem vorherigen aufbaut. Erst nach Schritt 6 sollte mit echten Daten gearbeitet werden.

## 1. Server bereitstellen

- [ ] Stack nach [deployment.md](deployment.md) auf **projectx.cubivivit.de** installiert, HTTPS-Zertifikat aktiv
- [ ] Nächtliche Sicherung läuft (`docker compose logs backup`), eine Rücksicherung einmal testweise durchgespielt
- [ ] Passwortschutz (Basic Auth) gesetzt **oder** Microsoft-Anmeldung eingeschaltet (Abschnitt 7 der
      [Entra-Anleitung](microsoft-entra-app-registrierung.md)); Rollen den Mitarbeitenden zugewiesen
- [ ] Optional: E-Mail-Versand (Microsoft 365 oder SMTP) eingerichtet und Testmail aus *Einstellungen →
      Benachrichtigungen* erhalten

## 2. Grundeinstellungen

- [ ] **Gesellschaften** anlegen: Name, Anschrift, Steuernummer, DATEV-Berater-/Mandantennummer, IBAN/BIC (für
      SEPA-Zahlungsläufe)
- [ ] **Briefbogen** je Gesellschaft hinterlegen (*Gesellschaften → Gesellschaft → Briefbogen für Schreiben*): PDF hochladen
      (aus der Word-Vorlage „Speichern unter → PDF“), Ränder einstellen und mit dem **Musterbrief** prüfen
- [ ] **Basiszinssätze** prüfen (*Einstellungen → Allgemein*), fehlende Halbjahre nachtragen
- [ ] **Standardmängel-Katalog** übernehmen und an die eigenen Formulierungen anpassen

## 3. Geschäftspartner übernehmen

1. In AMADEUS X die Adressen als Excel- oder CSV-Liste exportieren (alternativ vorhandene Excel-Listen verwenden).
2. *Einstellungen → Datenimport → Geschäftspartner*: Datei hochladen und **Datei prüfen**.
   - Spalten werden anhand der Überschrift erkannt (z. B. „Adressnummer“, „Firmenname“, „Name“, „Strasse“,
     „Partnerart“). Nicht erkannte Spalten werden angezeigt und ignoriert.
   - Pflicht ist nur die Spalte **Rollen** (Kunde, Interessent, Handwerker, Lieferant, Notar, Makler, Bank, Sonstige –
     mehrere mit Komma). Fehlende Nummern und Suchcodes werden automatisch vergeben.
   - CSV aus Excel (Semikolon, Windows-Zeichensatz) und .xlsx werden gelesen; das alte .xls-Format bitte vorher als
     .xlsx speichern. Wer neu beginnt, lädt die **Excel-Vorlage** herunter.
3. Fehlerhafte Zeilen in der Datei korrigieren und erneut prüfen, bis „bereit zur Übernahme“ erscheint.
4. **Datensätze übernehmen** – alles oder nichts, jeder Datensatz wird im Änderungsprotokoll mit „(Import)“ vermerkt.
5. Spätere Korrekturen per Import: „Vorhandene aktualisieren“ ankreuzen; Datensätze mit gleicher Nr. werden dann
   überschrieben, unveränderte bleiben unberührt.

- [ ] Handwerker: Freistellungsbescheinigungen (§ 48b EStG) mit Gültigkeitsdatum und IBAN vollständig
- [ ] Käufer: Anschrift und E-Mail vollständig (für Schreiben und Käuferportal)

## 4. Projekte und Einheiten

- [ ] Projekte anlegen (Projektart, Grundbuchangaben, Kostenstelle, Termine)
- [ ] Einheiten je Projekt importieren: *Datenimport → Einheiten eines Projekts* oder am Projekt „Aus Excel/CSV
      importieren“. Pflicht: **Nr.** und **Typ**; Flächen, MEA, Preise im deutschen Zahlenformat. Stellplätze und
      Hobbyräume über „Gehört zu Nr.“ der Wohnung zuordnen.
- [ ] Summe der MEA (1.000 ‰) und Verkaufsvolumen mit der Verkaufsliste abgleichen

## 5. Laufende Vorgänge erfassen

Bewegungsdaten werden bewusst **nicht** per Massenimport übernommen, damit Ratenpläne, Fristen und Zahlungsstände
von der Plattform selbst berechnet und geprüft werden:

- [ ] Kaufverträge mit Kaufpreis, Ratenplan, Beurkundungsdatum und bereits angeforderten/gezahlten Raten
- [ ] Bautenstand je Projekt (bereits erreichte MaBV-Abschnitte)
- [ ] Gewerkeplan aus der Vorlage, Handwerkerverträge mit Nachträgen, offene Eingangsrechnungen
- [ ] Bürgschaften (erhalten und § 7 MaBV), offene Mängel, Bauzeitenplan

## 6. Abgleich vor dem Echtbetrieb

- [ ] Offene Posten Verkauf = Debitorensaldo laut Buchhaltung
- [ ] Kostenstand je Projekt = Werte aus AMADEUS X bzw. Kostenkontrolle
- [ ] MaBV-Prüfbericht ohne unerklärte Feststellungen
- [ ] Kontenzuordnung je Gesellschaft unter **Buchhaltung** mit dem Steuerberater abstimmen (Bank, Erhaltene
      Anzahlungen, Erlöse ab Übergabe, Bauleistungen, Skonti, Bauabzugsteuer, Personenkontenbereiche). Personenkonten: eigenes Debitoren-/Kreditorenkonto
      am Geschäftspartner (auch per Import, Spalten „Debitorenkonto“/„Kreditorenkonto“), sonst Partnernummer mit
      Personenkontolänge (z. B. 70001), sonst Basis + Partnernummer
- [ ] DATEV-Export einmal mit dem Steuerberater testen (Testimport, Festschreibung erst danach im Echtbetrieb)
- [ ] SEPA-Datei einmal im Onlinebanking der Hausbank einlesen (ohne Ausführung)
- [ ] IBAN je Gesellschaft eintragen und einen Kontoauszug (CAMT.053, sonst MT940) im **Bankabgleich** einlesen; Zuordnung mit den offenen Posten vergleichen

## 7. Umstellung

- [ ] Stichtag festlegen; ab dann neue Vorgänge nur noch in der Plattform erfassen
- [ ] AMADEUS X für Rückfragen lesend weiter verfügbar halten (Aufbewahrungspflichten beachten)
- [ ] Nach vier Wochen: Rückblick mit allen Beteiligten, offene Wünsche sammeln
