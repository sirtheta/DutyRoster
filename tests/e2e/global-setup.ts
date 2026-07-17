import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";

export const E2E_ADMIN = { email: "admin@e2e.local", password: "e2e-password-123" };
export const E2E_EDITOR = { email: "editor@e2e.local", password: "e2e-password-123" };

/**
 * Creates a fresh SQLite database for the E2E run and seeds two users.
 * The dev server started by Playwright's webServer points at this file.
 */
export default function globalSetup(): void {
  const dataDir = path.join(__dirname, ".data");
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "e2e.db");

  execSync("npx prisma db push", {
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
    },
  });

  const db = new Database(dbPath);
  const insert = db.prepare(
    `INSERT INTO User (email, name, passwordHash, role, isActive, rotationOrder, icalToken, updatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'))`
  );
  // Low bcrypt cost — these credentials only ever exist inside the test run.
  insert.run(E2E_ADMIN.email, "E2E Admin", hashSync(E2E_ADMIN.password, 4), "Admin", 0, "e2e-token-admin");
  insert.run(E2E_EDITOR.email, "E2E Editor", hashSync(E2E_EDITOR.password, 4), "Editor", 1, "e2e-token-editor");
  db.close();
}
