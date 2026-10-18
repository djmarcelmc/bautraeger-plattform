# Microsoft-Entra-App-Registrierung für die Bauträger-Plattform

**Für:** Administrator:in von Microsoft 365 / Microsoft Entra ID
**Dauer:** ca. 15 Minuten
**Benötigte Rolle:** mindestens *Anwendungsadministrator* (Cloud Application Administrator); für die Administratorzustimmung in Schritt 4 *Globaler Administrator* oder *Privilegierter Rollenadministrator*

Die Bauträger-Plattform meldet Benutzer mit ihrem Microsoft-365-Konto an (Single Sign-on). In einer späteren
Ausbaustufe versendet sie außerdem E-Mails (Zahlungsanforderungen, Mängelrügen) und trägt Termine im Outlook-Kalender ein.
Dafür wird eine App-Registrierung in eurem Mandanten benötigt.

---

## 1. App registrieren

1. [Microsoft Entra Admin Center](https://entra.microsoft.com) öffnen.
2. **Identität → Anwendungen → App-Registrierungen → Neue Registrierung**
3. Ausfüllen:
   - **Name:** `Bauträger-Plattform`
   - **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis (einzelner Mandant)*
   - **Umleitungs-URI:** Plattform **Web**, Adresse
     `http://localhost:3000/api/auth/callback/microsoft-entra-id`
     (für die Entwicklung). Danach unter **Authentifizierung → URI hinzufügen** zusätzlich das Produktivsystem:
     `https://projectx.cubivivit.de/api/auth/callback/microsoft-entra-id`
4. **Registrieren** klicken.
5. Auf der Übersichtsseite notieren:
   - **Anwendungs-ID (Client)**
   - **Verzeichnis-ID (Mandant)**

## 2. Geheimen Clientschlüssel anlegen

1. **Zertifikate & Geheimnisse → Geheime Clientschlüssel → Neuer geheimer Clientschlüssel**
2. Beschreibung `Bauträger-Plattform`, Ablauf **24 Monate**.
3. Den **Wert** sofort kopieren (er wird nur einmal angezeigt) – nicht die „Geheimnis-ID“.
4. Ablaufdatum im Kalender vormerken; vorher muss ein neuer Schlüssel erstellt werden.

## 3. App-Rollen anlegen

**App-Rollen → App-Rolle erstellen**, jeweils mit *Zulässige Mitgliedstypen: Benutzer/Gruppen*:

| Anzeigename | Wert | Beschreibung |
| --- | --- | --- |
| Administrator | `Bautraeger.Admin` | Vollzugriff inkl. Einstellungen |
| Geschäftsführung | `Bautraeger.Geschaeftsfuehrung` | Vollzugriff auf Projekte, Freigaben ab Schwellwert |
| Buchhaltung | `Bautraeger.Buchhaltung` | Rechnungen, Zahlungen, DATEV-Export |
| Vertrieb | `Bautraeger.Vertrieb` | Einheiten, Interessenten, Kaufverträge |
| Bauleitung | `Bautraeger.Bauleitung` | Bautenstand, Mängel, sachliche Rechnungsprüfung |
| Steuerberater | `Bautraeger.Steuerberater` | nur lesend, DATEV-Export |

## 4. API-Berechtigungen

**API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**:

- `openid`, `profile`, `email`, `offline_access`
- `User.Read`

Anschließend **Administratorzustimmung für „<Mandant>“ erteilen** klicken.

### 4a. E-Mail-Versand der Plattform (Benachrichtigungen)

Damit die Plattform Benachrichtigungen aus einem gemeinsamen Postfach (z. B. `bautraeger@…`) verschickt:

1. **Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen → `Mail.Send`**, danach Administratorzustimmung erteilen.
2. **Unbedingt einschränken**, sonst dürfte die App aus *jedem* Postfach senden. In der Exchange Online PowerShell:

   ```powershell
   New-DistributionGroup -Name "Bautraeger-Plattform-Versand" -Type Security -Members bautraeger@ihre-domain.de
   New-ApplicationAccessPolicy -AppId <Anwendungs-ID> -PolicyScopeGroupId "Bautraeger-Plattform-Versand" `
     -AccessRight RestrictAccess -Description "Bauträger-Plattform darf nur aus diesem Postfach senden"
   Test-ApplicationAccessPolicy -AppId <Anwendungs-ID> -Identity bautraeger@ihre-domain.de   # → Granted
   ```
3. In der Plattform: `MAIL_ABSENDER=bautraeger@ihre-domain.de`, `MAIL_GRAPH_TENANT=<Verzeichnis-ID>`,
   `MAIL_GRAPH_CLIENT_ID=<Anwendungs-ID>`, `MAIL_GRAPH_SECRET=<Wert des Clientschlüssels>`.

### 4b. Rechnungspostfach (Rechnungseingang)

Die Plattform holt Rechnungen aus einem gemeinsamen Postfach (z. B. `rechnungen@…`) alle 10 Minuten ab: ungelesene Mails
mit Anhang im Posteingang, PDF/ZUGFeRD/XRechnung landen unter **Rechnungseingang**. Danach wird die Mail als gelesen
markiert und erhält die Kategorie „Bauträger-Plattform“ (sie bleibt im Postfach).

1. **Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen → `Mail.ReadWrite`**, Administratorzustimmung
   erteilen (ReadWrite wird nur zum Markieren als gelesen benötigt).
2. **Auf das Rechnungspostfach beschränken** – das Postfach in dieselbe Sicherheitsgruppe aufnehmen wie das
   Versandpostfach (oder eine eigene Gruppe/Richtlinie anlegen):

   ```powershell
   Add-DistributionGroupMember -Identity "Bautraeger-Plattform-Versand" -Member rechnungen@ihre-domain.de
   Test-ApplicationAccessPolicy -AppId <Anwendungs-ID> -Identity rechnungen@ihre-domain.de   # → Granted
   Test-ApplicationAccessPolicy -AppId <Anwendungs-ID> -Identity chef@ihre-domain.de         # → Denied
   ```
3. In der Plattform zusätzlich `RECHNUNGEN_POSTFACH=rechnungen@ihre-domain.de` setzen (Zugangsdaten wie beim Versand).
   Mit `RECHNUNGEN_ABRUF=aus` lässt sich der automatische Abruf abschalten (manuell über „Postfach jetzt abrufen“).

> **Später (Ausbaustufe Outlook):** zusätzlich delegiert `Mail.ReadWrite`, `Calendars.ReadWrite` für persönliche Postfächer.

## 5. Zugriff auf zugewiesene Benutzer beschränken

1. **Identität → Anwendungen → Unternehmensanwendungen → Bauträger-Plattform**
2. **Eigenschaften → Zuweisung erforderlich? → Ja** → Speichern
3. **Benutzer und Gruppen → Benutzer/Gruppe hinzufügen** → Personen (oder Gruppen) der passenden App-Rolle zuweisen.

Nur zugewiesene Personen können sich danach anmelden; die Rolle steuert die Rechte in der Plattform.

## 6. Daten sicher übermitteln

Bitte diese drei Werte **über einen Passwortmanager oder einen anderen sicheren Kanal** weitergeben –
nicht im Klartext per E-Mail oder Chat:

- Verzeichnis-ID (Mandant)
- Anwendungs-ID (Client)
- Wert des geheimen Clientschlüssels (+ Ablaufdatum)

In der Plattform werden sie als Umgebungsvariablen hinterlegt (nie im Quellcode):

```bash
AUTH_MICROSOFT_ENTRA_ID_ID=<Anwendungs-ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<Wert des Clientschlüssels>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<Verzeichnis-ID>/v2.0
```

## 7. Umstellung in der Plattform (durch den Betreiber)

Die Anmeldung ist fertig eingebaut und wird nur per Konfiguration eingeschaltet. In `.env.prod` auf dem Server:

```bash
AUTH_SECRET=<openssl rand -base64 32>
AUTH_MICROSOFT_ENTRA_ID_ID=<Anwendungs-ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<Wert des Clientschlüssels>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<Verzeichnis-ID>/v2.0
AUTH_AKTIV=true
```

1. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` – jetzt erscheint nach dem Passwort die
   Microsoft-Anmeldung. Mit jeder Rolle einmal anmelden und testen.
2. Funktioniert alles: `CADDYFILE=Caddyfile.entra` setzen und erneut `up -d` – der gemeinsame Passwortschutz entfällt,
   das Käuferportal bleibt über die persönlichen Links erreichbar.
3. Zurück (Notfall): `AUTH_AKTIV=false`, `CADDYFILE=Caddyfile` und die `AUTH_MICROSOFT_*`-Werte leeren.

### Rechte je Rolle

| Recht | Admin | Geschäftsführung | Buchhaltung | Vertrieb | Bauleitung | Steuerberater |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Alles ansehen, Auswertungen, Excel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Geschäftspartner, Dokumente | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Projekte und Einheiten | ✓ | ✓ | – | ✓ | – | – |
| Kaufverträge, Raten, Zahlungsanforderungen, Käuferportal | ✓ | ✓ | – | ✓ | – | – |
| Zahlungseingänge, Mahnungen | ✓ | ✓ | ✓ | ✓ | – | – |
| Bautenstand, Bauzeitenplan, Mängel, Abnahmen | ✓ | ✓ | – | – | ✓ | – |
| Gewerke, Handwerkerverträge, Nachträge | ✓ | ✓ | – | – | ✓ | – |
| Rechnungen erfassen und prüfen | ✓ | ✓ | ✓ | – | ✓ | – |
| Rechnungen freigeben | ✓ | ✓ | – | – | – | – |
| Rechnungen bezahlen, Zahlungsläufe (SEPA) | ✓ | ✓ | ✓ | – | – | – |
| Bürgschaften | ✓ | ✓ | ✓ | – | ✓ | – |
| Gesellschaften, Einstellungen, Benachrichtigungen | ✓ | ✓ | – | – | – | – |

- **Vier-Augen-Prinzip:** Wer eine Rechnung geprüft hat, kann sie nicht selbst freigeben.
- Die Rechte prüft die API bei jedem Aufruf; die Oberfläche blendet zusätzlich aus (z. B. „Einstellungen“).
- Im Änderungsprotokoll steht die E-Mail-Adresse der angemeldeten Person.
- Personen mit mehreren Rollen erhalten die Rechte aller Rollen.

---

## Checkliste

- [ ] App registriert (einzelner Mandant, Umleitungs-URI eingetragen)
- [ ] Anwendungs-ID und Verzeichnis-ID notiert
- [ ] Geheimer Clientschlüssel erstellt, Ablaufdatum vorgemerkt
- [ ] Sechs App-Rollen angelegt
- [ ] Delegierte Berechtigungen hinzugefügt und Administratorzustimmung erteilt
- [ ] „Zuweisung erforderlich“ aktiviert, Benutzer den Rollen zugewiesen
- [ ] Werte sicher übermittelt
- [ ] Optional: `Mail.Send` (Anwendung) mit Application Access Policy für Benachrichtigungen
- [ ] Optional: `Mail.ReadWrite` (Anwendung) für das Rechnungspostfach, ebenfalls per Application Access Policy beschränkt
