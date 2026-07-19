/**
 * Captures the screenshots embedded in public/benutzerhandbuch.html.
 *
 * Use a production build, not `next dev` — dev mode shows the Turbopack
 * activity badge and (on /settings) a dev-only "Dev-Tools" card that isn't
 * in the existing screenshots, so they'd visibly mismatch.
 *
 * Usage:
 *   1. Seed a demo instance:  DATABASE_URL=file:./data/demo-manual.db \
 *        npx prisma db push && DATABASE_URL=file:./data/demo-manual.db \
 *        ENCRYPTION_KEY=<any 32+ char string> npx tsx scripts/seed-manual-demo.ts
 *   2. Build + start against it (webpack, not turbopack — see note below):
 *        DATABASE_URL=file:./data/demo-manual.db npx next build --webpack
 *        DATABASE_URL=file:./data/demo-manual.db ENCRYPTION_KEY=<same as above> \
 *          DISABLE_EMAIL=true DISABLE_TELEGRAM=true DISABLE_BACKUP=true \
 *          AUTH_SECRET=<any 32+ char string> AUTH_URL=http://localhost:3222 \
 *          npx next start --webpack -p 3222
 *      Gotcha: proxy.ts picks the NextAuth cookie name from NODE_ENV, not from
 *      AUTH_URL's protocol, so a *production* build served over plain http
 *      (as here) gets redirected straight back to /login — the cookie it
 *      looks for ("__Secure-authjs.session-token") doesn't match the one
 *      actually set ("authjs.session-token") when AUTH_URL is http. Only
 *      matters for this local http capture setup; a real deployment's
 *      AUTH_URL is https so the names agree. Work around it locally by
 *      temporarily changing proxy.ts's SESSION_COOKIE ternary to key off
 *      `process.env.AUTH_URL?.startsWith("https://")` instead of NODE_ENV,
 *      rebuilding, and reverting before committing.
 *   3. Capture:  MANUAL_BASE_URL=http://localhost:3222 npx tsx scripts/manual-screenshots.ts [names...]
 *      (omit names to capture everything; pass e.g. "dashboard notification-dialog"
 *      to only regenerate specific shots — see the `shots` list below for names)
 *   4. Splice the PNGs in scripts/.manual-shots/ back into the manual (as base64
 *      data URIs) with scripts/splice-manual-screenshots.ts.
 *
 * If running the build from a second worktree while a dev server for this
 * repo is already running elsewhere: Next refuses a second `next dev` against
 * the same project dir regardless of port, and Turbopack chokes on a
 * node_modules junction/symlink outside the worktree root ("Symlink
 * [project]/node_modules is invalid, it points out of the filesystem root")
 * — pass --webpack to sidestep both.
 *
 * Demo account: admin@demo.local / editor@demo.local, password Demo1234!
 * (see scripts/seed-manual-demo.ts for the full roster).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const BASE_URL = process.env.MANUAL_BASE_URL ?? "http://localhost:3222";
const OUT_DIR = path.join(__dirname, ".manual-shots");
const ADMIN = { email: "admin@demo.local", password: "Demo1234!" };
const EDITOR = { email: "editor@demo.local", password: "Demo1234!" };

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|calendar)/);
}

type Shot = { name: string; run: (page: Page) => Promise<void> };

const shots: Shot[] = [
  {
    name: "dashboard",
    run: async (page) => {
      await login(page, ADMIN);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector("text=Dienstübersicht");
      await page.screenshot({ path: path.join(OUT_DIR, "dashboard.png"), fullPage: true });
    },
  },
  {
    name: "notification-dialog",
    run: async (page) => {
      await login(page, ADMIN);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector("text=Dienstübersicht");
      await page.click('button[aria-haspopup="menu"]:has-text("SB"), [data-slot="avatar"]');
      await page.click("text=Benachrichtigungen");
      await page.waitForSelector("text=Benachrichtigung aktiv");
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, "notification-dialog.png") });
    },
  },
  {
    name: "diensttausch",
    run: async (page) => {
      await login(page, EDITOR);
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForSelector("text=Anfragen"); // the submit button in the "Tausch anfragen" form
      await page.locator('button:has-text("Anfragen")').last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, "diensttausch.png") });
    },
  },
  {
    name: "users-new-dialog",
    run: async (page) => {
      await login(page, ADMIN);
      await page.goto(`${BASE_URL}/users`);
      await page.waitForSelector("text=Benutzer");
      await page.click("text=Neuer Benutzer");
      await page.waitForSelector("text=Name");
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, "users-new-dialog.png") });
    },
  },
  {
    name: "users-edit-dialog",
    run: async (page) => {
      await login(page, ADMIN);
      await page.goto(`${BASE_URL}/users`);
      await page.waitForSelector("text=Léa Fischer");
      await page
        .locator("tr", { hasText: "Léa Fischer" })
        .getByText("Bearbeiten")
        .click();
      await page.waitForSelector("text=Benutzer bearbeiten");
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, "users-edit-dialog.png") });
    },
  },
  {
    name: "settings",
    run: async (page) => {
      await login(page, ADMIN);
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForSelector("text=SMTP (E-Mail-Versand)");
      await page.locator('button:has-text("Speichern")').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, "settings.png") });
    },
  },
];

async function main() {
  const requested = process.argv.slice(2);
  const selected = requested.length ? shots.filter((s) => requested.includes(s.name)) : shots;
  if (selected.length === 0) {
    console.error("No matching shots. Known names:", shots.map((s) => s.name).join(", "));
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const shot of selected) {
    // Fresh context per shot so each login starts logged out — /login
    // redirects away immediately for an already-authenticated session.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await shot.run(page);
      console.log("captured:", shot.name);
    } catch (err) {
      console.error("failed:", shot.name, err);
    } finally {
      await page.close();
      await context.close();
    }
  }

  await browser.close();
}

main();
