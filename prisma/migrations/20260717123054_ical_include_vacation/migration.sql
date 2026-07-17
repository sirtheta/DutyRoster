-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SystemSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromName" TEXT,
    "telegramBotToken" TEXT,
    "defaultCanton" TEXT NOT NULL DEFAULT 'BE',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SystemSettings" ("defaultCanton", "id", "smtpFromName", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "telegramBotToken", "updatedAt") SELECT "defaultCanton", "id", "smtpFromName", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "telegramBotToken", "updatedAt" FROM "SystemSettings";
DROP TABLE "SystemSettings";
ALTER TABLE "new_SystemSettings" RENAME TO "SystemSettings";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "exitDate" TEXT,
    "rotationOrder" INTEGER NOT NULL DEFAULT 0,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyChannel" TEXT NOT NULL DEFAULT 'Email',
    "notifyWeekday" INTEGER NOT NULL DEFAULT 1,
    "notifyHour" INTEGER NOT NULL DEFAULT 7,
    "telegramChatId" TEXT,
    "icalToken" TEXT NOT NULL,
    "icalIncludeVacation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "exitDate", "icalToken", "id", "isActive", "name", "notifyChannel", "notifyEnabled", "notifyHour", "notifyWeekday", "passwordHash", "role", "rotationOrder", "telegramChatId", "updatedAt") SELECT "createdAt", "email", "exitDate", "icalToken", "id", "isActive", "name", "notifyChannel", "notifyEnabled", "notifyHour", "notifyWeekday", "passwordHash", "role", "rotationOrder", "telegramChatId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_icalToken_key" ON "User"("icalToken");
CREATE INDEX "User_rotationOrder_idx" ON "User"("rotationOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
