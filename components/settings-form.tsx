"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
import { HelpDialog } from "@/components/ui/help-dialog";

type TestResult = { success?: boolean; error?: string; message?: string };

export function SettingsForm({
  settings,
  telegramBotTokenSet,
}: {
  settings: Pick<
    SystemSettings,
    "smtpHost" | "smtpPort" | "smtpUser" | "smtpFromName" | "smtpFromAddress"
  > | null;
  telegramBotTokenSet: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [testPending, startTest] = useTransition();
  const [telegramTestPending, startTelegramTest] = useTransition();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [telegramTestResult, setTelegramTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (state?.success) toast.success("Einstellungen gespeichert.");
  }, [state]);

  function runConnectionTest() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setTestResult(null);
    startTest(async () => {
      const result = await testSmtpConnectionAction(formData);
      if (result.success) {
        setTestResult({ success: true, message: "Verbindung erfolgreich" });
      } else {
        setTestResult({ error: result.error });
      }
    });
  }

  function runTelegramTest() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setTelegramTestResult(null);
    startTelegramTest(async () => {
      const result = await testTelegramConnectionAction(formData);
      if (result.success) {
        setTelegramTestResult({
          success: true,
          message: result.botUsername
            ? `Verbindung erfolgreich (@${result.botUsername})`
            : "Verbindung erfolgreich",
        });
      } else {
        setTelegramTestResult({ error: result.error });
      }
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
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="smtpFromAddress">
              Absender-E-Mail <span className="text-muted-foreground">(leer lassen = gleich wie Benutzer)</span>
            </Label>
            <Input
              id="smtpFromAddress"
              name="smtpFromAddress"
              type="email"
              defaultValue={settings?.smtpFromAddress ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Wird als Absenderadresse verwendet, falls sie sich vom Benutzer oben unterscheidet (z. B. Login mit
              info@firma.ch, Versand als sanitaet@firma.ch). Funktioniert nur, wenn der Mailserver das für die
              angegebene Domain zulässt.
            </p>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="button" variant="outline" disabled={testPending} onClick={runConnectionTest}>
              {testPending ? "Wird getestet…" : "Verbindung testen"}
            </Button>
            {testResult?.error && <p className="text-xs text-destructive">{testResult.error}</p>}
            {testResult?.success && (
              <p className="text-xs text-green-600 dark:text-green-400">{testResult.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1 text-base">
            Telegram
            <HelpDialog title="Telegram-Bot einrichten" label="Hilfe zur Telegram-Bot-Einrichtung">
              <ol>
                <li>
                  In Telegram den Chat mit <strong>@BotFather</strong> öffnen und <code>/newbot</code> senden.
                </li>
                <li>Einen Anzeigenamen und einen Benutzernamen vergeben (muss auf &bdquo;bot&ldquo; enden).</li>
                <li>
                  BotFather antwortet mit einem <strong>API-Token</strong> (z. B.{" "}
                  <code>123456789:ABCdef…</code>) — dieses Token kopieren.
                </li>
                <li>Das Token unten im Feld &bdquo;Bot-Token&ldquo; einfügen und speichern.</li>
                <li>
                  Mit &bdquo;Verbindung testen&ldquo; prüfen, ob der Bot erreichbar ist. Damit einzelne
                  Benutzer:innen Nachrichten erhalten, müssen sie zusätzlich den Chat mit dem Bot
                  starten und ihre Chat-ID in ihren eigenen Benachrichtigungseinstellungen hinterlegen.
                </li>
              </ol>
            </HelpDialog>
          </CardTitle>
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
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" disabled={telegramTestPending} onClick={runTelegramTest}>
              {telegramTestPending ? "Wird getestet…" : "Verbindung testen"}
            </Button>
            {telegramTestResult?.error && (
              <p className="text-xs text-destructive">{telegramTestResult.error}</p>
            )}
            {telegramTestResult?.success && (
              <p className="text-xs text-green-600 dark:text-green-400">{telegramTestResult.message}</p>
            )}
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
