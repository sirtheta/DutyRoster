import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Einstellungen</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
