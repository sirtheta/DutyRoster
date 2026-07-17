import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import cron from "node-cron";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import { createTestDatabase, createTestUser } from "../test-utils";
import { runBackup, pruneOldBackups, startBackupScheduler } from "@/lib/backup";

vi.mock("node-cron", () => ({ default: { schedule: vi.fn(), validate: vi.fn(() => true) } }));

const db = createTestDatabase();
vi.mock("@/lib/prisma", () => ({ get default() { return db.prisma; } }));

describe("backup", () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), "backup-test-"));
    vi.mocked(cron.schedule).mockClear();
    vi.mocked(cron.validate).mockClear().mockReturnValue(true);
    delete (globalThis as unknown as { backupSchedulerStarted?: boolean }).backupSchedulerStarted;
    delete process.env.DISABLE_BACKUP;
  });

  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true });
  });

  it("writes a consistent snapshot of the live database", async () => {
    const { prisma } = db;
    await prisma.user.create({ data: createTestUser({ email: "snapshot@example.com" }) });

    const now = new Date(2026, 6, 17);
    const target = await runBackup(prisma, { backupDir, now });

    expect(target).toBe(join(backupDir, "DutyRoster-backup-2026-07-17.db"));
    expect(existsSync(target)).toBe(true);

    // The backup is a standalone, readable SQLite database with the data.
    const snapshot = new Database(target, { readonly: true });
    const row = snapshot.prepare("SELECT COUNT(*) AS n FROM User").get() as { n: number };
    snapshot.close();
    expect(row.n).toBe(1);
  });

  it("replaces a same-day backup instead of failing", async () => {
    const { prisma } = db;
    const now = new Date(2026, 6, 17);
    await runBackup(prisma, { backupDir, now });
    await expect(runBackup(prisma, { backupDir, now })).resolves.toBeTruthy();
    expect(readdirSync(backupDir)).toHaveLength(1);
  });

  it("prunes backups older than maxKeepDays and leaves other files alone", async () => {
    const { prisma } = db;
    writeFileSync(join(backupDir, "DutyRoster-backup-2026-06-01.db"), "old");
    writeFileSync(join(backupDir, "DutyRoster-backup-2026-07-10.db"), "recent");
    writeFileSync(join(backupDir, "unrelated.txt"), "keep me");

    await runBackup(prisma, { backupDir, now: new Date(2026, 6, 17), maxKeepDays: 14 });

    const files = readdirSync(backupDir).sort();
    expect(files).toEqual([
      "DutyRoster-backup-2026-07-10.db",
      "DutyRoster-backup-2026-07-17.db",
      "unrelated.txt",
    ]);
  });

  it("keeps all backups when maxKeepDays is 0", () => {
    writeFileSync(join(backupDir, "DutyRoster-backup-2020-01-01.db"), "ancient");
    const deleted = pruneOldBackups(backupDir, 0, new Date(2026, 6, 17));
    expect(deleted).toBe(0);
    expect(existsSync(join(backupDir, "DutyRoster-backup-2020-01-01.db"))).toBe(true);
  });

  it("registers the cron job once and honors DISABLE_BACKUP", () => {
    startBackupScheduler();
    startBackupScheduler(); // second call is a no-op
    expect(cron.schedule).toHaveBeenCalledTimes(1);

    delete (globalThis as unknown as { backupSchedulerStarted?: boolean }).backupSchedulerStarted;
    vi.mocked(cron.schedule).mockClear();
    process.env.DISABLE_BACKUP = "true";
    startBackupScheduler();
    expect(cron.schedule).not.toHaveBeenCalled();
  });

  it("does not register a cron job when the schedule is invalid", () => {
    vi.mocked(cron.validate).mockReturnValueOnce(false);
    startBackupScheduler();
    expect(cron.schedule).not.toHaveBeenCalled();
  });
});
