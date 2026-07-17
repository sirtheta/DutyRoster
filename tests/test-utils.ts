import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { execSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { beforeAll, afterAll, beforeEach } from "vitest";

type TestPrisma = ReturnType<typeof createPrismaClient>;

function createPrismaClient(dbPath: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter }) as unknown as PrismaClient;
}

/**
 * Registers beforeAll/beforeEach/afterAll hooks that create and teardown
 * a temporary SQLite database for a test suite. Call at describe-level and
 * access `db.prisma` inside each it() block.
 */
export function createTestDatabase() {
  const rawPath = join(tmpdir(), `test-${randomUUID()}.db`);
  // Prisma CLI expects forward slashes even on Windows
  const dbPath = rawPath.replace(/\\/g, "/");
  const dbUrl = `file:${dbPath}`;
  const projectRoot = process.cwd();

  const state: { prisma: TestPrisma } = {} as { prisma: TestPrisma };

  beforeAll(() => {
    execSync("npx prisma db push", {
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
      },
      cwd: projectRoot,
    });
    state.prisma = createPrismaClient(dbPath);
  }, 30_000);

  beforeEach(async () => {
    const p = state.prisma;
    await p.pendingNotification.deleteMany();
    await p.passwordResetToken.deleteMany();
    await p.swapRequest.deleteMany();
    await p.auditLog.deleteMany();
    await p.entry.deleteMany();
    await p.holiday.deleteMany();
    await p.systemSettings.deleteMany();
    await p.user.deleteMany();
  });

  afterAll(async () => {
    await state.prisma.$disconnect();
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // best-effort cleanup
      }
    }
  });

  return state;
}

export function createTestUser(overrides: Partial<Parameters<PrismaClient["user"]["create"]>[0]["data"]> = {}) {
  return {
    email: "test@example.com",
    name: "Test User",
    passwordHash: "irrelevant-in-tests",
    role: "Editor" as const,
    isActive: true,
    ...overrides,
  };
}
