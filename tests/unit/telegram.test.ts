import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SystemSettings } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";
import { encryptSecret } from "@/lib/crypto";

function settings(overrides: Partial<SystemSettings> = {}): SystemSettings {
  return {
    id: 1,
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPassword: null,
    smtpFromName: null,
    telegramBotToken: encryptSecret("bot-token"),
    ...overrides,
  } as SystemSettings;
}

describe("sendTelegramMessage", () => {
  const originalFetch = global.fetch;
  const originalDisable = process.env.DISABLE_TELEGRAM;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789ab";
    delete process.env.DISABLE_TELEGRAM;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DISABLE_TELEGRAM = originalDisable;
  });

  it("posts to the Telegram API with the decrypted bot token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendTelegramMessage(settings(), "12345", "Hallo");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "12345", text: "Hallo" }),
      })
    );
  });

  it("throws with the API error detail when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "Bad Request" }) as unknown as typeof fetch;

    await expect(sendTelegramMessage(settings(), "12345", "Hallo")).rejects.toThrow("Telegram API 400: Bad Request");
  });

  it("throws when no bot token is configured", async () => {
    await expect(sendTelegramMessage(settings({ telegramBotToken: null }), "12345", "Hallo")).rejects.toThrow(
      "Telegram Bot Token nicht konfiguriert."
    );
  });

  it("skips sending when DISABLE_TELEGRAM=true", async () => {
    process.env.DISABLE_TELEGRAM = "true";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendTelegramMessage(settings(), "12345", "Hallo");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
