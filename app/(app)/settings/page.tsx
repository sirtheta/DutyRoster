import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { SettingsForm } from "@/components/settings-form";
import { DevToolsCard } from "@/components/dev-tools-card";

export default async function SettingsPage() {
  await requireAdmin();
  // Only the fields the form displays — the encrypted smtpPassword and
  // telegramBotToken ciphertexts stay on the server.
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpFromName: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Einstellungen</h1>
      <SettingsForm settings={settings} />
      {process.env.NODE_ENV !== "production" && <DevToolsCard />}
    </div>
  );
}
