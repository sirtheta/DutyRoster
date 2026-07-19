import type { SystemSettings } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import logger from "@/lib/logger";

const log = logger.child({ module: "telegram" });

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escapes plain text for Telegram's HTML parse mode and turns bare http(s)
 * URLs into explicit `<a>` tags. Telegram's own autolinking of plain URLs
 * is unreliable for hosts without a recognized public TLD (e.g. `localhost`
 * during local testing), so links are made clickable explicitly instead of
 * relying on that heuristic.
 */
function toTelegramHtml(text: string): string {
  return text
    .split(/(https?:\/\/\S+)/g)
    .map((part, i) => (i % 2 === 1 ? `<a href="${escapeHtml(part)}">${escapeHtml(part)}</a>` : escapeHtml(part)))
    .join("");
}

export async function sendTelegramMessage(
  settings: SystemSettings,
  chatId: string,
  text: string
): Promise<void> {
  if (process.env.DISABLE_TELEGRAM === "true") {
    log.info("Telegram-Versand deaktiviert (DISABLE_TELEGRAM=true)");
    return;
  }
  if (!settings.telegramBotToken) {
    throw new Error("Telegram Bot Token nicht konfiguriert.");
  }
  const botToken = decryptSecret(settings.telegramBotToken);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: toTelegramHtml(text), parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram API ${res.status}: ${detail}`);
  }
}

/** Verifies a bot token works by calling Telegram's `getMe`, returning the bot's username on success. */
export async function verifyTelegramBotToken(botToken: string): Promise<{ username?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram API ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return { username: data?.result?.username };
}
