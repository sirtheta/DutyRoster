import nodemailer from "nodemailer";
import type { SystemSettings } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import logger from "@/lib/logger";

const log = logger.child({ module: "email" });

function buildTransport(settings: SystemSettings) {
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
    throw new Error("SMTP nicht konfiguriert. Bitte SMTP-Einstellungen hinterlegen.");
  }
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: (settings.smtpPort ?? 587) === 465,
    auth: {
      user: settings.smtpUser,
      pass: decryptSecret(settings.smtpPassword),
    },
  });
}

export async function sendPlanEmail(
  settings: SystemSettings,
  to: string,
  subject: string,
  text: string
): Promise<void> {
  if (process.env.DISABLE_EMAIL === "true") {
    log.info("E-Mail-Versand deaktiviert (DISABLE_EMAIL=true)");
    return;
  }
  const transporter = buildTransport(settings);
  const fromName = settings.smtpFromName || settings.smtpUser!;
  await transporter.sendMail({
    from: `"${fromName}" <${settings.smtpUser}>`,
    to,
    subject,
    text,
  });
}
