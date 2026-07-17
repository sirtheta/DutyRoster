-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PendingNotification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PendingNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PendingNotification" ("body", "channel", "createdAt", "error", "failedAt", "id", "sentAt", "subject", "userId") SELECT "body", "channel", "createdAt", "error", "failedAt", "id", "sentAt", "subject", "userId" FROM "PendingNotification";
DROP TABLE "PendingNotification";
ALTER TABLE "new_PendingNotification" RENAME TO "PendingNotification";
CREATE INDEX "PendingNotification_sentAt_idx" ON "PendingNotification"("sentAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
