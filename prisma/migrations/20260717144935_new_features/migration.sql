-- CreateTable
CREATE TABLE "SwapRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fromUserId" INTEGER NOT NULL,
    "toUserId" INTEGER NOT NULL,
    "dates" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "SwapRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SwapRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT false,
    "notifyWeekday" INTEGER NOT NULL DEFAULT 1,
    "notifyHour" INTEGER NOT NULL DEFAULT 7,
    "telegramChatId" TEXT,
    "icalToken" TEXT NOT NULL,
    "icalIncludeVacation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("id", "email", "name", "passwordHash", "role", "isActive", "exitDate", "rotationOrder", "notifyEnabled", "notifyEmail", "notifyTelegram", "notifyWeekday", "notifyHour", "telegramChatId", "icalToken", "icalIncludeVacation", "createdAt", "updatedAt")
SELECT "id", "email", "name", "passwordHash", "role", "isActive", "exitDate", "rotationOrder", "notifyEnabled",
    CASE WHEN "notifyChannel" = 'Telegram' THEN false ELSE true END,
    CASE WHEN "notifyChannel" = 'Telegram' THEN true ELSE false END,
    "notifyWeekday", "notifyHour", "telegramChatId", "icalToken", "icalIncludeVacation", "createdAt", "updatedAt"
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_icalToken_key" ON "User"("icalToken");
CREATE INDEX "User_rotationOrder_idx" ON "User"("rotationOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SwapRequest_status_idx" ON "SwapRequest"("status");

-- CreateIndex
CREATE INDEX "SwapRequest_fromUserId_idx" ON "SwapRequest"("fromUserId");

-- CreateIndex
CREATE INDEX "SwapRequest_toUserId_idx" ON "SwapRequest"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
