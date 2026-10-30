# CLAUDE.md

**Always use the `caveman` skill** (invoke via Skill tool at start of each conversation/task).

## Overview

Duty-roster / vacation planner ("Sanitätsplaner") for a Swiss company first-aid team. Next.js 16 (App Router), TypeScript, React 19, Tailwind 4, Prisma + SQLite. UI, user text and docs are **German**.

End-user manual (Admin/Editor, screenshots): `public/benutzerhandbuch.html` (served at `/benutzerhandbuch.html`). Documents behavior, not implementation. After significant UI changes regenerate its screenshots; don't hand-edit stale ones.

**Next.js 16 has breaking changes** — before touching routing, middleware or data fetching, check `node_modules/next/dist/docs/`; don't assume older-Next behavior.

## Commands

```bash
npm run dev                # dev server :3000
npm run build              # prod build
npm run lint               # ESLint
npx prisma migrate dev --name <name>   # new migration (also run after pulling schema changes)
npx prisma studio
npm run db:seed            # faker data, dev only
npm test                   # Vitest, all
npm run test:watch
npm run test:coverage      # v8
npm run test:integration
npm run test:e2e           # Playwright, own dev server on :3111
npx vitest run tests/unit/rotation.test.ts   # single file
```

`prisma generate` runs on `postinstall`.

## Architecture

- `app/(auth)/` public (login, forgot/reset password). `app/(app)/` protected, session required: `calendar/[year]/` (main planner grid), `dashboard/`, `holidays/` (canton holidays via `date-holidays`), `settings/` (SMTP, Telegram, rotation, system), `users/` (roles, rotation order, notify prefs), `swaps/`, `audit/`, `logs/`.
- Mutations = Server Actions in co-located `actions.ts`. API routes only for external/streaming: `/api/ical/[token]`, `/api/plan/[year]/export`, `/api/calendar/[year]/stream`, `/api/logs/[filename]`, NextAuth.
- `lib/` shared server utils. `prisma/schema.prisma` = data model source of truth.

**Auth** (`lib/auth.ts`): NextAuth v5 Credentials + bcrypt. Constant-time login (`dummyCompare`) hides user existence. In-memory login rate limit (`lib/rate-limit.ts`). JWT sessions, 7d (`lib/config.ts`). `role` (`Admin | Editor | Viewer`) in JWT → `session.user.role`. Password reset (`lib/password-reset.ts`): emailed single-use link, SHA-256 hash stored, 1h TTL, generic responses (no enumeration), rate-limited per email + IP.

**Authz** (`lib/permissions.ts`): `requireRole(roles)` / `requireAdmin()` / `requireEditor()` / `requireSession()` at top of Server Components/Actions (redirect to `/login` or `/calendar`). `hasRole(session, roles)` sync check for UI.

**Rotation** (`lib/rotation.ts`): `runRotation()` pure fn. Input: year, active users sorted by `rotationOrder`, holidays, per-user blocked/occupied dates. Assigns Mon–Fri weeks via queue → `{ assignments, uncoveredWeeks }`. Front user blocked → next available takes week, blocked user keeps place (gets following week). Week uncovered only if *every* user blocked. Weeks already covered by S-duty and fully-holiday weeks skipped without consuming a turn.

**EntryType** (schema): `S` Sanität/duty, `F` Ferien, `G` geschäftliche Absenz, `C` Kompensieren, `M` Militär, `K` Kurzarbeit, `TZ` Teilzeit, `A` Ausbildung, `H` Homeoffice. Labels/colors + `AUTOMATION_BLOCKED` (types blocking automation) in `lib/entry-types.ts`.

**Notifications** (`lib/notifications.ts`): `node-cron` job `startNotificationScheduler` (`NOTIFY_CRON_SCHEDULE`, default every 5 min) matches each active user's weekday/hour/minute (5-min steps) in `NOTIFY_TIMEZONE` (not server TZ); if user has S-duty that week, queues `PendingNotification`, sent via email (`lib/email.ts`) or Telegram (`lib/telegram.ts`) per `user.notifyChannel`. Failed sends retried up to `NOTIFY_MAX_ATTEMPTS`, then shown on settings page with manual retry. Old notification/audit rows pruned per `NOTIFY_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS`.

**Swaps** (`app/(app)/swaps/actions.ts`, `SwapRequest`): any user (incl. Viewer) offers own upcoming S-week from dashboard to one colleague or broadcast to all active colleagues (one row per colleague, shared `groupId`). First accept gets duties atomically (`source: Swap`); other rows → `Superseded` (those colleagues notified). Colleague(s) or Admin accept/decline. All decisions notified via `PendingNotification` and audit-logged.

**Encrypted settings**: SMTP password + Telegram bot token AES-encrypted in `SystemSettings` (`lib/crypto.ts`, `ENCRYPTION_KEY`).

**iCal** (`app/api/ical/[token]/route.ts`): per-user token (`User.icalToken`, 32 random bytes, rotatable on dashboard), no session. Feeds `F` + `S` entries. Failed token lookups rate-limited per IP.

**Audit** (`lib/audit.ts`): `logAudit(session, action, entityType, entityId, details)` → `AuditLog`. Failures logged, never thrown.

**Backups** (`lib/backup.ts`): nightly cron (`BACKUP_CRON_SCHEDULE`) `VACUUM INTO` snapshot to `backups/` beside DB file, one per day, `BACKUP_MAX_KEEP_DAYS` retention. In Docker lives in data volume, so syncing `./data` includes backups.

**Logs** (`lib/log-capture.ts`, `lib/logs.ts`): `startLogCapture()` tees `process.stdout`/`stderr` to `logs/app.log` in data volume (= everything `docker logs` shows). **Must be first call in `instrumentation.ts` `register()`, and `lib/log-capture.ts` must not import `lib/logger`.** Reason: pino writes straight to fd 1/2 via `SonicBoom`, bypassing `process.stdout.write`, unless those were reassigned before first `pino()` call (`hasBeenTampered`). Importing `lib/logs` or anything importing `lib/logger` earlier silently breaks capture (empty downloaded file). Nightly job copy-truncates `app.log` → `app-<date>.log` (rename would leave open stream writing into renamed file), prunes past `LOG_MAX_KEEP_DAYS`. Admin download at `/logs` via `GET /api/logs/[filename]`; filename validated against exact `app.log` / `app-YYYY-MM-DD.log` before FS access.

**Time** (`lib/app-time.ts`): `APP_TIMEZONE` (env → `TZ` → `Europe/Zurich`) decides server-side calendar days + rendered times: `todayString()`/`dayOf()`, `currentYear()`/`yearOf()`, `appDayStart()` (UTC instant local day starts, for filtering UTC columns), `formatDateTime()`. Storage stays UTC. **Server code must not use bare `new Date().getFullYear()` or `toDateString(new Date())`** — on UTC host rolls over before Swiss midnight. Client components exempt (browser TZ). Backup/log-rotation crons + their filenames use same zone. pino `zonedTimestamp` = ISO-8601 with UTC offset (DST-safe).

**Prod startup** (`scripts/startup.js`, Docker): applies pending Prisma migrations via `better-sqlite3` (no Prisma CLI in image), seeds first Admin from env, ensures `SystemSettings` row, then starts Next.

## Env vars

Full list incl. session/rate-limit/logging overrides: `.env.example`.

| Var | Notes |
|---|---|
| `DATABASE_URL` | default `file:./data/DutyRoster.db` |
| `AUTH_SECRET` | prod; ≥32 chars; Docker auto-generates + persists in volume if unset |
| `AUTH_URL` | prod; full URL for auth redirects |
| `ENCRYPTION_KEY` | prod; 32-byte hex; Docker auto-generates + persists if unset |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH`) | first run, bootstrap admin |
| `DEFAULT_CANTON` | holiday seeding, default `BE` |
| `NOTIFY_CRON_SCHEDULE` | default `*/5 * * * *` |
| `APP_TIMEZONE` | → `TZ` → `Europe/Zurich` |
| `NOTIFY_TIMEZONE` | default `APP_TIMEZONE` |
| `NOTIFY_MAX_ATTEMPTS` | default `3` |
| `NOTIFY_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` | default `90` / `365`, `0` = forever |
| `BACKUP_CRON_SCHEDULE` / `BACKUP_MAX_KEEP_DAYS` | default `30 2 * * *` / `14`, `0` = keep all |
| `LOG_ROTATE_CRON_SCHEDULE` / `LOG_MAX_KEEP_DAYS` | default `35 2 * * *` / `14`, `0` = keep all |
| `DISABLE_EMAIL` / `DISABLE_TELEGRAM` / `DISABLE_BACKUP` / `DISABLE_LOG_ROTATION` | dev/staging switches |

## Testing

`tests/unit/`, `tests/integration/` (in-memory/temp SQLite, `tests/setup.ts`). Coverage only `lib/**/*.ts` + `app/api/**/*.ts`. E2E `tests/e2e/`: dev server :3111, freshly seeded DB (`tests/e2e/global-setup.ts`, admin `admin@e2e.local`); CI `e2e` job runs `npx playwright install chromium` first.

## Commits

English, Conventional Commits (drives `release-please`): `feat:` minor, `fix:` patch, `feat!:`/`fix!:`/`BREAKING CHANGE:` major; `chore:`/`docs:`/`test:`/`refactor:`/`build:`/`ci:` no release. Scope encouraged, e.g. `feat(rotation): skip fully-holiday weeks`.

## CI/CD

`web.yml`: push/PR to `main` (ignores doc-only) → ESLint, Vitest + coverage, prod build. Push to `main` → `release-please` release PR (tag `DutyRoster-v<version>`; config `release-please-config.json`, `.release-please-manifest.json`). On release or `workflow_dispatch` → Docker image to `ghcr.io/sirtheta/duty-roster` (ARM64).
