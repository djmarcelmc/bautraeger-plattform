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

> **Später (Ausbaustufe Outlook):** zusätzlich delegiert `Mail.ReadWrite`, `Calendars.ReadWrite`.
> Für ein zentrales Rechnungspostfach (z. B. rechnung@…) eine Anwendungsberechtigung `Mail.Read`, die per
> Exchange-Online-Richtlinie **auf genau dieses Postfach beschränkt** wird. Das stimmen wir dann gesondert ab.

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

---

## Checkliste

- [ ] App registriert (einzelner Mandant, Umleitungs-URI eingetragen)
- [ ] Anwendungs-ID und Verzeichnis-ID notiert
- [ ] Geheimer Clientschlüssel erstellt, Ablaufdatum vorgemerkt
- [ ] Sechs App-Rollen angelegt
- [ ] Delegierte Berechtigungen hinzugefügt und Administratorzustimmung erteilt
- [ ] „Zuweisung erforderlich“ aktiviert, Benutzer den Rollen zugewiesen
- [ ] Werte sicher übermittelt
