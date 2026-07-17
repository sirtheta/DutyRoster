# Sanitätsplaner

[![Web CI/CD](https://github.com/sirtheta/DutyRoster/actions/workflows/web.yml/badge.svg)](https://github.com/sirtheta/DutyRoster/actions/workflows/web.yml)

Ein Dienstplanungstool für das Sanitätsteam eines Unternehmens. Die Anwendung verwaltet Jahreskalender mit Diensten, Abwesenheiten und einer automatischen Rotation der Dienstzuteilung.

## Funktionen

- **Jahreskalender** – Übersicht pro Mitarbeitendem mit Diensten und Abwesenheiten für ein ganzes Jahr
- **Automatische Dienstrotation** – weist Arbeitswochen (Mo–Fr) reihum an aktive Mitarbeitende zu, unter Berücksichtigung von Feiertagen und bereits belegten Wochen
- **Eintragstypen**: Sanität (Dienst), Ferien, Geschäftliche Absenz, Kompensieren, Militär, Kurzarbeit, Teilzeit, Ausbildung, Homeoffice
- **Feiertagsverwaltung** – kantonale Feiertage (Schweiz), automatisch eingepflegt über `date-holidays`
- **Benachrichtigungen** – stündlicher Job prüft fällige Erinnerungen und verschickt sie per E‑Mail oder Telegram
- **iCal-Feed** – persönlicher, token-basierter Kalender-Export (Dienste & Ferien) für Kalender-Apps
- **Excel-Export** – Jahresplan als Excel-Datei exportierbar
- **Benutzerverwaltung** – Rollen (Admin, Editor, Viewer), Rotationsreihenfolge, Benachrichtigungskanal pro Person
- **Passwort zurücksetzen** – Self-Service per E-Mail-Link („Passwort vergessen?“ auf der Anmeldeseite)
- **Diensttausch** – Tauschanfragen an Kolleg:innen direkt vom Dashboard; beim Annehmen werden die Dienste automatisch übertragen
- **Audit-Log** – protokolliert Änderungen an Plänen und Einstellungen
- **Nächtliche Backups** – tägliche SQLite-Sicherung (`VACUUM INTO`) in den Datenordner, mit konfigurierbarer Aufbewahrungsdauer

## Technologie-Stack

- [Next.js 16](https://nextjs.org/) (App Router) mit TypeScript und React 19
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Prisma](https://www.prisma.io/) mit SQLite (via `better-sqlite3`)
- [NextAuth v5](https://authjs.dev/) für Authentifizierung
- [Vitest](https://vitest.dev/) für Unit- und Integrationstests

## Schnellstart mit Docker

Die einfachste Art, den Sanitätsplaner zu betreiben:

```bash
docker compose up -d
```

Die Anwendung ist danach unter `http://localhost:3000` erreichbar. Für einen produktiven Einsatz sollten eigene Werte für `AUTH_SECRET`, `ENCRYPTION_KEY` und `AUTH_URL` per `.env`-Datei gesetzt werden (siehe `.env.example`).

## Lokale Entwicklung

```bash
npm install
npx prisma migrate dev
npm run dev
```

Die App läuft anschliessend unter `http://localhost:3000`.

Weitere nützliche Befehle:

```bash
npm run build             # Produktions-Build
npm run lint               # ESLint
npx prisma studio          # GUI zur Inspektion der Datenbank
npm run db:seed            # Testdaten einspielen (nur für Entwicklung)

npm test                   # Alle Tests
npm run test:watch         # Tests im Watch-Modus
npm run test:coverage      # Testabdeckung
npm run test:integration   # Nur Integrationstests
npm run test:e2e           # Playwright-E2E-Tests (startet eigenen Dev-Server)
```

## Konfiguration

Die wichtigsten Umgebungsvariablen (vollständige Liste in `.env.example`):

| Variable | Erforderlich | Beschreibung |
|---|---|---|
| `DATABASE_URL` | Nein | SQLite-Pfad, Standard: `file:./data/DutyRoster.db` |
| `AUTH_SECRET` | Nur Produktion | Signaturschlüssel für NextAuth-JWTs (min. 32 Zeichen) |
| `AUTH_URL` | Nur Produktion | Vollständige URL für Auth-Redirects |
| `ENCRYPTION_KEY` | Nur Produktion | 32-Byte-Hex-Schlüssel zur Verschlüsselung von SMTP-/Telegram-Zugangsdaten |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | Beim ersten Start | Erstellt den initialen Admin-Benutzer |
| `DEFAULT_CANTON` | Nein | ISO-Kantonscode für die Feiertagsseedung (Standard: `BE`) |
| `NOTIFY_CRON_SCHEDULE` | Nein | Cron-Ausdruck für die stündliche Benachrichtigungsprüfung |
| `BACKUP_CRON_SCHEDULE` / `BACKUP_MAX_KEEP_DAYS` | Nein | Zeitplan der nächtlichen DB-Sicherung (Standard: 02:30) und Aufbewahrung in Tagen (Standard: 14, `0` = alle behalten) |
| `DISABLE_EMAIL` / `DISABLE_TELEGRAM` / `DISABLE_BACKUP` | Nein | Deaktiviert ausgehende Benachrichtigungen bzw. Backups (für Entwicklung/Staging) |

## Backups & Wiederherstellung

Die Anwendung erstellt jede Nacht (Standard: 02:30) eine konsistente Kopie der SQLite-Datenbank per `VACUUM INTO` unter `<Datenordner>/backups/DutyRoster-backup-YYYY-MM-DD.db`. Alte Sicherungen werden nach `BACKUP_MAX_KEEP_DAYS` Tagen (Standard: 14) automatisch gelöscht. Wer den Datenordner ohnehin extern sichert (z.&nbsp;B. auf ein NAS), erhält die Backups damit automatisch mit.

**Wiederherstellung:** Container stoppen, die gewünschte Backup-Datei über die Datenbankdatei kopieren (`cp data/backups/DutyRoster-backup-….db data/dutyroster.db`), allfällige `*-wal`/`*-shm`-Dateien daneben löschen und den Container wieder starten.

## Projektstruktur

```
├── app/
│   ├── (auth)/       # Öffentliche Routen (Login)
│   ├── (app)/         # Geschützte Routen (Kalender, Dashboard, Feiertage, Einstellungen, Benutzer)
│   └── api/           # REST-Endpunkte (iCal-Feed, Plan-Export, NextAuth)
├── lib/               # Server-seitige Utilities (Auth, Rotation, Benachrichtigungen, Audit, Berechtigungen)
├── prisma/            # Datenbankschema und Migrationen
└── tests/             # Unit- und Integrationstests
```

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
