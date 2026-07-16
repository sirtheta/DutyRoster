# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a duty-roster / vacation planner ("Sanitätsplaner") built for a Swiss first-aid team for a company, implemented as a Next.js 16 web dashboard (TypeScript, React 19, Tailwind CSS 4, Prisma + SQLite).

The UI, user-facing text, and documentation are **in German**.

---

## Web Application (repo root)

### Commands

```bash
# Development
npm run dev            # Start dev server at localhost:3000
npm run build          # Production build
npm run lint           # ESLint check

# Database
npx prisma migrate dev --name <name>   # Create and apply a new migration
npx prisma studio                       # GUI to inspect the DB
npm run db:seed                         # Seed with faker data (dev only)

# Tests
npm test               # Run all tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (v8)
npm run test:integration  # Integration tests only
# Run a single test file:
npx vitest run tests/unit/rotation.test.ts
```

> **Note:** `prisma generate` runs automatically via `postinstall`. After pulling schema changes, run `npx prisma migrate dev` to keep the local DB in sync.

### Architecture

**Next.js App Router layout:**

- `app/(auth)/` — Public routes (login)
- `app/(app)/` — Protected routes; all require an active session
  - `calendar/[year]/` — The main planner grid: per-user duty/absence entries for a given year
  - `dashboard/` — Overview page
  - `holidays/` — Canton holiday management (seeded via `date-holidays`)
  - `settings/` — SMTP, Telegram, rotation, and system-wide config
  - `users/` — User management (roles, rotation order, notification preferences)
- `app/api/` — REST endpoints (iCal feed, plan export, NextAuth handlers)
- `lib/` — Shared server-side utilities (auth, rotation, notifications, audit, permissions)
- `prisma/schema.prisma` — Single source of truth for the data model

**Data mutations** use Next.js Server Actions (`actions.ts` files co-located with routes), not API routes. API routes are reserved for external-facing/streaming endpoints (`/api/ical/[token]`, `/api/plan/[year]/export`, NextAuth).

**Authentication** (`lib/auth.ts`):
- NextAuth v5 Credentials provider with bcrypt password validation
- Constant-time login response (`dummyCompare`) so a bad email doesn't reveal user existence via timing
- In-memory rate limiting on login attempts (`lib/rate-limit.ts`)
- JWT sessions, 8-hour max age (configurable via `lib/config.ts`)
- `user.role` (`Admin | Editor | Viewer`) is embedded in the JWT and carried into `session.user.role`

**Authorization** (`lib/permissions.ts`):
- `requireRole(roles)` / `requireAdmin()` / `requireEditor()` / `requireSession()` — call at the top of Server Components or Server Actions that need role gating; redirects to `/login` or `/calendar` on failure
- `hasRole(session, roles)` — synchronous check for UI rendering

**Duty rotation** (`lib/rotation.ts`):
- `runRotation()` is a pure function: given a year, active users (sorted by `rotationOrder`), holidays, and each user's already-blocked/occupied dates, it assigns Mon–Fri work weeks to users round-robin
- A week is skipped (rotation still advances) if the assigned user is blocked that week or the week is already covered by someone else; a fully-holiday week doesn't consume a turn at all
- `EntryType` (`prisma/schema.prisma`): `S` (Sanität/duty), `F` (Ferien), `G` (geschäftliche Absenz), `C` (Kompensieren), `M` (Militär), `K` (Kurzarbeit), `TZ` (Teilzeit), `A` (Ausbildung), `H` (Homeoffice) — labels/colors in `lib/entry-types.ts`, and `AUTOMATION_BLOCKED` defines which types make a user unavailable for the automation

**Notifications** (`lib/notifications.ts`): An hourly `node-cron` job (`startNotificationScheduler`, schedule from `NOTIFY_CRON_SCHEDULE`) matches each active user's configured weekday/hour, queues a `PendingNotification` if they have an S-Dienst that week, then dispatches via email (`lib/email.ts`) or Telegram (`lib/telegram.ts`) per `user.notifyChannel`.

**Encrypted settings**: SMTP password and Telegram bot token are AES-encrypted at rest in `SystemSettings` via `lib/crypto.ts`, using the `ENCRYPTION_KEY` env var.

**iCal feed** (`app/api/ical/[token]/route.ts`): Per-user, token-authenticated (`User.icalToken`, 32 random bytes, rotatable from the dashboard) `.ics` feed of `F` and `S` entries — no session required, just the token. Failed token lookups are rate-limited per IP.

**Audit logging** (`lib/audit.ts`): `logAudit(session, action, entityType, entityId, details)` writes to `AuditLog`; failures are logged but never thrown, so a broken audit trail never blocks the underlying mutation.

**Production startup** (`scripts/startup.js`): In the Docker image, this script applies pending Prisma migrations directly via `better-sqlite3` (no Prisma CLI in the image), seeds the first Admin user from env vars, and ensures a `SystemSettings` row exists before the Next.js server starts.

### Key Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | No | SQLite path, defaults to `file:./data/DutyRoster.db` |
| `AUTH_SECRET` | Production only | NextAuth JWT signing key (min 32 chars); in Docker auto-generated on first start and persisted in the data volume if unset |
| `AUTH_URL` | Production only | Full URL for auth redirects |
| `ENCRYPTION_KEY` | Production only | 32-byte hex key for encrypting SMTP/Telegram secrets at rest; in Docker auto-generated on first start and persisted in the data volume if unset |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | First run | Bootstraps the initial admin user |
| `ADMIN_PASSWORD_HASH` | First run | Pre-hashed bcrypt alternative to `ADMIN_PASSWORD` |
| `DEFAULT_CANTON` | No | ISO canton code for `date-holidays` seeding, defaults to `BE` |
| `NOTIFY_CRON_SCHEDULE` | No | Cron expression for the hourly notification check, defaults to `0 * * * *` |
| `ROTATION_BLOCK_SIZE` | No | Default consecutive-day block size for the yearly rotation automation |
| `DISABLE_EMAIL` / `DISABLE_TELEGRAM` | No | Dev/staging switches to suppress outgoing notifications |

See `.env.example` for the full list, including session/rate-limit/logging overrides.

### Testing

Tests live in `tests/unit/` and `tests/integration/`. Integration tests use an in-memory or temp SQLite database (configured in `tests/setup.ts`). Coverage is collected only for `lib/**/*.ts` and `app/api/**/*.ts`.

---

## Commit Conventions

All commit messages must be **in English** and follow the [Conventional Commits](https://www.conventionalcommits.org/) spec, which `release-please` uses to determine version bumps and generate changelogs:

- `feat: <description>` — new feature — minor version bump
- `fix: <description>` — bug fix — patch version bump
- `feat!:` / `fix!:` or `BREAKING CHANGE:` footer — breaking change — major version bump
- `chore:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:` — no release triggered

The scope is optional but encouraged, e.g. `feat(rotation): skip fully-holiday weeks`.

---

## CI/CD

The **`web.yml`** GitHub Actions workflow triggers on pushes/PRs to `main` (ignoring doc-only changes). It runs ESLint, then Vitest with coverage, then a production build. On push to `main`, `release-please` opens/updates a release PR (tags as `DutyRoster-v<version>`); once a release is created (or on manual `workflow_dispatch`), the job builds and pushes a Docker image to `ghcr.io/sirtheta/duty-roster` (ARM64 target).

Versioning is managed by `release-please` (config: `release-please-config.json`, manifest: `.release-please-manifest.json`).

---

## Next.js Version Note

This project uses **Next.js 16**, which has breaking changes from earlier versions. Before modifying routing, middleware, or data-fetching patterns, check `node_modules/next/dist/docs/` for current API conventions — do not assume behavior from older Next.js knowledge.
