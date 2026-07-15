# Security Review — Sanitätsplaner (DutyRoster)

**Date:** 2026-07-15
**Scope:** Full application review of `Sanitaetsplaner.web/` (Next.js 16, NextAuth v5, Prisma + SQLite), including auth, authorization, server actions, API routes, secret handling, deployment config (Dockerfile, docker-compose), and startup scripts.
**Method:** Manual source review of all `app/`, `lib/`, `components/`, `scripts/`, and config files.

## Summary

The application has a solid security baseline: role-gated server actions, bcrypt with a timing-equalizing dummy compare, login rate limiting, AES-256-GCM encryption of stored secrets, a nonce-based CSP, security headers, audit logging, and no use of `dangerouslySetInnerHTML` or raw SQL. No critical remote-exploitable vulnerability was found.

The most important issues are: (1) the shipped docker-compose fallback secrets pass production validation, so a deployment without a `.env` runs with a publicly known JWT signing key; (2) full Prisma `User` rows — including bcrypt password hashes and iCal tokens — are serialized to the browser on the admin users page; and (3) role changes and deactivation do not take effect until the JWT expires (up to 8 hours).

## Remediation status (2026-07-15)

All findings were remediated on this branch:

| Finding | Status | Fix |
|---|---|---|
| H1 default secrets | **Fixed** | docker-compose no longer ships fallback secrets. When `AUTH_SECRET`/`ENCRYPTION_KEY` are unset, `scripts/startup.js` generates random ones on first start and persists them in the data volume (`data/secrets.json`, mode 600); the entrypoint sources them before the server starts, so `docker compose up` still works without a `.env`. `lib/env.ts` additionally rejects the known placeholder values and enforces a minimum `ENCRYPTION_KEY` length. |
| M1 `passwordHash` in RSC payload | **Fixed** | `/users` query uses an explicit `select`; client components take a narrowed `UserListItem` type without `passwordHash`/`icalToken`. |
| M2 stale JWT privileges | **Fixed** | The `jwt` callback re-checks `role`/`isActive` in the DB at most every 60 s and invalidates the session for missing/deactivated users. |
| M3 iCal token | **Fixed** | New tokens are `crypto.randomBytes(32)` (base64url); users can rotate their token from the dashboard ("Link neu generieren"); failed token lookups are rate-limited per IP (successful feeds are never throttled). |
| M4 rate limiter | **Fixed** | Bucket map is capped (expired-entry sweep + hard cap of 10 000), rate-limit key uses the normalized email, and a wider per-IP login bucket (10× the per-account limit) throttles account spraying. |
| L1 ciphertext to client | **Fixed** | Settings page selects only the four displayed fields. |
| L2 plaintext passthrough | **Fixed** | `decryptSecret` logs a warning when it encounters an unencrypted stored secret (re-saving encrypts it). |
| L3 password in logs | **Fixed** | The generated bootstrap password is written to `data/initial-admin-password.txt` (mode 600) instead of the container logs. |
| L4 Host-header URL | **Fixed** | The iCal URL prefers `AUTH_URL`; the Host header is only a fallback. |
| L5 unvalidated action inputs | **Fixed** | All calendar/holiday server-action inputs are zod-validated (real calendar dates, comment ≤ 500 chars, bounded batch sizes, year range, canton format). |
| L6 dependency posture | **Partially addressed** | Dependabot was already configured (missed in the original review). `next-auth` remains on the v5 beta — switch to stable when released. |

---

## High

### H1. Publicly known default `AUTH_SECRET`/`ENCRYPTION_KEY` pass production validation

- `docker-compose.yml:20-22` falls back to `AUTH_SECRET: INSECURE-DEFAULT-CHANGE-ME-min-32-characters-long` and `ENCRYPTION_KEY: INSECURE-DEFAULT-CHANGE-ME-not-a-real-key` when no `.env` is present.
- `lib/env.ts` only checks that the variables exist and that `AUTH_SECRET` is ≥ 32 characters. The insecure default is 48 characters, so validation **passes** and the app starts normally in production.

**Impact:** On any deployment where the operator skipped the `.env` step (`docker compose up` "just works", as the comment in the file says), the JWT signing key is public knowledge from this repository. Anyone can forge a session token with `role: "Admin"` and take over the instance without credentials. The encryption key for SMTP/Telegram secrets is likewise known.

**Recommendation:** In `validateEnv()`, refuse to start when `AUTH_SECRET` or `ENCRYPTION_KEY` equals the shipped default (e.g. reject values containing `INSECURE-DEFAULT`). Better: remove the fallbacks from docker-compose entirely and let startup fail loudly with a clear message.

---

## Medium

### M1. `passwordHash`, `icalToken` and `telegramChatId` of all users are sent to the browser

- `app/(app)/users/page.tsx:11` loads users with `prisma.user.findMany()` (no `select`) and passes each full row to the client components `UserRowActions` / `UserFormDialog`.
- Props passed from a Server Component to a `"use client"` component are serialized into the RSC payload delivered to the browser.

**Impact:** Every admin page view ships all users' bcrypt password hashes (offline-cracking material), everyone's immutable iCal bearer tokens, and Telegram chat IDs to the browser, where they sit in the page payload, browser cache, and are visible to any browser extension. The page is admin-only, which limits the audience, but hashes and bearer tokens should never leave the server.

**Recommendation:** Use an explicit `select` with only the fields the UI needs (`id`, `email`, `name`, `role`, `isActive`, `rotationOrder`, notify fields). Consider Reacts `experimental_taintObjectReference`/`taintUniqueValue` on `passwordHash` as a safety net.

### M2. Role changes and deactivation only take effect at next login (stale JWT privileges)

- `lib/auth.ts:72-85`: `token.role` is set only when `user` is present, i.e. at sign-in. On session refresh the token is re-signed with the old claims; the DB is never re-checked.
- Session `maxAge` is 8h (`lib/config.ts`).

**Impact:** A user who is demoted (Admin → Viewer) or deactivated via `toggleActiveAction` keeps their old role and access for up to 8 hours. `isActive` is only enforced in `authorize()` at login and in the iCal route — nowhere in the session path.

**Recommendation:** In the `jwt` callback, periodically (e.g. on each `updateAge` refresh) re-load `role` and `isActive` from the DB and invalidate the token for inactive users. Alternatively check `isActive` in `requireRole()`.

### M3. iCal token: weak generator for a bearer credential, no rotation, no rate limit

- `prisma/schema.prisma:40`: `icalToken String @unique @default(cuid())`. Prisma's `cuid()` is not designed as a cryptographic secret (timestamp + counter + fingerprint + small random block), yet the token is the sole credential for `app/api/ical/[token]/route.ts`.
- The token is documented as stable/immutable — a leaked token (calendar URLs end up in Google/Apple/Outlook accounts, referrer logs, chat messages) cannot be rotated without DB surgery.
- The endpoint has no rate limiting, so token guessing is unthrottled.

**Impact:** Disclosure of a user's vacation/duty schedule (personal data) to whoever obtains or guesses a token, with no recovery path short of editing the DB.

**Recommendation:** Generate tokens with `crypto.randomBytes(32)`, add a "regenerate token" action for users/admins, and rate-limit the endpoint (the in-memory limiter in `lib/rate-limit.ts` can be reused keyed by IP).

### M4. Login rate limiter: unbounded memory growth and email-only keying

- `lib/rate-limit.ts`: the `Map` is keyed by `login:<email>` from unauthenticated input and entries are never evicted (only overwritten after `resetAt` or deleted on successful login).

**Impact:** (a) An attacker can grow the map without bound by cycling unique email strings — slow memory exhaustion of the single-process app. (b) Limiting per email but not per IP means one IP can hammer many accounts in parallel; conversely an attacker can lock out a known victim's email (5 attempts / 15 min) as a nuisance DoS.

**Recommendation:** Cap the map size or sweep expired buckets periodically; normalize the email (lowercase/trim); add a second, larger per-IP bucket.

---

## Low

### L1. Encrypted secrets ciphertext sent to the admin browser

`app/(app)/settings/page.tsx:8` passes the full `SystemSettings` row (including `smtpPassword` and `telegramBotToken` ciphertext) into the client `SettingsForm`, which never displays them. Ciphertext is useless without `ENCRYPTION_KEY`, but combined with H1 (known default key) it becomes readable. Select only the fields the form renders.

### L2. `decryptSecret()` silently accepts plaintext

`lib/crypto.ts:50`: values without the `enc:v1:` prefix are returned unchanged. This passthrough (for legacy rows) means a plaintext credential written to the DB keeps working forever and nothing flags it. Consider logging a warning and re-encrypting on read, or migrating once and removing the passthrough.

### L3. Generated admin bootstrap password printed to logs

`scripts/startup.js:93` and `prisma/seed.ts:32` print the generated admin password to stdout. It's a deliberate bootstrap tradeoff, but `docker logs` output is often shipped to log aggregators and retained. Consider printing only once with a strong "change immediately" warning (already there) and forcing a password change on first login.

### L4. iCal/dashboard URL built from the `Host` request header

`app/(app)/dashboard/page.tsx:32-34` builds the subscription URL from `headers().get("host")`. Behind a misconfigured proxy a spoofed Host header would only mislead the viewing user (self-inflicted), but preferring `AUTH_URL` as the canonical origin is more robust.

### L5. Server-action inputs partially unvalidated

`upsertEntryAction` / `bulkSetEntriesAction` / `moveEntryAction` (`app/(app)/calendar/[year]/actions.ts`) accept `date` strings and `comment` without schema validation (no `YYYY-MM-DD` regex, no length cap), unlike the zod-validated user/holiday/settings actions. Authorization is correct, so this is data-integrity rather than a vulnerability (malformed dates create orphaned rows outside any calendar view; unlimited comment length allows DB bloat). Add a zod schema mirroring `holidaySchema`.

### L6. Dependency posture

`next-auth@5.0.0-beta.31` is a pre-release pinned in production. The rest of the stack (Next 16.2.10, Prisma 7, bcryptjs 3, zod 4) is current. Track the NextAuth v5 stable release and run `npm audit`/Dependabot in CI (the `web.yml` workflow currently doesn't).

---

## Positive observations

- **Authorization is consistently enforced server-side:** every server action and protected route calls `requireAdmin`/`requireEditor`/`requireSession` first; the `proxy.ts` cookie check is correctly treated as optimistic-only. Non-admin editors are restricted to their own entries (`assertOwnEntry`), including in the bulk/move paths.
- **Credential handling:** bcrypt with dummy-compare against a fixed hash to equalize response time; uniform login error message; rate limit before the DB lookup.
- **Secrets at rest:** AES-256-GCM with scrypt key derivation, random IV per encryption, auth-tag verified, decrypt failures fail closed (secret treated as unset).
- **Web hardening:** nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`; no `dangerouslySetInnerHTML`; all DB access through Prisma (no raw SQL / injection surface); Excel export writes values not formulas (no formula injection).
- **Operational:** audit log on every mutation that never blocks the mutation; production env validation at startup; non-root Docker user; dev-only tools (`triggerNotificationCheck`, seed) gated on `NODE_ENV`.

## Suggested remediation order

1. **H1** — reject the shipped default secrets at startup (small change, closes an auth-bypass class).
2. **M1** — add `select` to the users page query.
3. **M2** — re-check `role`/`isActive` on JWT refresh.
4. **M3/M4** — token generation/rotation and rate-limiter hardening.
5. The Low items as routine hardening.
