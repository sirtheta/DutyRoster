import type { SystemSettings } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import logger from "@/lib/logger";

const log = logger.child({ module: "telegram" });

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
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram API ${res.status}: ${detail}`);
  }
}
