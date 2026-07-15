"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { SystemSettings } from "@prisma/client";
import { updateSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SettingsForm({ settings }: { settings: SystemSettings | null }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, undefined);

  useEffect(() => {
    if (state?.success) toast.success("Einstellungen gespeichert.");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP (E-Mail-Versand)</CardTitle>
          <CardDescription>Wird für Benachrichtigungen verwendet.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtpHost">Host</Label>
            <Input id="smtpHost" name="smtpHost" defaultValue={settings?.smtpHost ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtpPort">Port</Label>
            <Input id="smtpPort" name="smtpPort" type="number" defaultValue={settings?.smtpPort ?? 587} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtpUser">Benutzer</Label>
            <Input id="smtpUser" name="smtpUser" defaultValue={settings?.smtpUser ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="smtpPassword">
              Passwort <span className="text-muted-foreground">(leer lassen = unverändert)</span>
            </Label>
            <Input id="smtpPassword" name="smtpPassword" type="password" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="smtpFromName">Absendername</Label>
            <Input id="smtpFromName" name="smtpFromName" defaultValue={settings?.smtpFromName ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="telegramBotToken">
              Bot-Token <span className="text-muted-foreground">(leer lassen = unverändert)</span>
            </Label>
            <Input id="telegramBotToken" name="telegramBotToken" type="password" />
          </div>
        </CardContent>
      </Card>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Speichern…" : "Speichern"}
      </Button>
    </form>
  );
}
