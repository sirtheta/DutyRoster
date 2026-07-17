"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import type { SystemSettings } from "@prisma/client";
import {
  updateSettingsAction,
  testSmtpConnectionAction,
  testTelegramConnectionAction,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SettingsForm({
  settings,
  telegramBotTokenSet,
}: {
  settings: Pick<SystemSettings, "smtpHost" | "smtpPort" | "smtpUser" | "smtpFromName"> | null;
  telegramBotTokenSet: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [testPending, startTest] = useTransition();
  const [telegramTestPending, startTelegramTest] = useTransition();

  useEffect(() => {
    if (state?.success) toast.success("Einstellungen gespeichert.");
  }, [state]);

  function runConnectionTest() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTest(async () => {
      const result = await testSmtpConnectionAction(formData);
      if (result.success) toast.success("SMTP-Verbindung erfolgreich getestet.");
      if (result.error) toast.error(result.error);
    });
  }

  function runTelegramTest() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTelegramTest(async () => {
      const result = await testTelegramConnectionAction(formData);
      if (result.success) {
        toast.success(
          result.botUsername
            ? `Telegram-Verbindung erfolgreich getestet (@${result.botUsername}).`
            : "Telegram-Verbindung erfolgreich getestet."
        );
      }
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
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
            <PasswordInput id="smtpPassword" name="smtpPassword" />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="smtpFromName">Absendername</Label>
            <Input id="smtpFromName" name="smtpFromName" defaultValue={settings?.smtpFromName ?? ""} />
          </div>
          <div className="col-span-2">
            <Button type="button" variant="outline" disabled={testPending} onClick={runConnectionTest}>
              {testPending ? "Wird getestet…" : "Verbindung testen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="telegramBotToken">
              Bot-Token <span className="text-muted-foreground">(leer lassen = unverändert)</span>
            </Label>
            <PasswordInput id="telegramBotToken" name="telegramBotToken" />
            <p className="text-xs text-muted-foreground">
              Status:{" "}
              {telegramBotTokenSet ? (
                <span className="text-foreground">Token hinterlegt</span>
              ) : (
                "Kein Token hinterlegt"
              )}
            </p>
          </div>
          <div>
            <Button type="button" variant="outline" disabled={telegramTestPending} onClick={runTelegramTest}>
              {telegramTestPending ? "Wird getestet…" : "Verbindung testen"}
            </Button>
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
