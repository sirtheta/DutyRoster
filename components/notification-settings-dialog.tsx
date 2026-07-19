"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { NotifyChannel } from "@prisma/client";
import {
  updateOwnNotificationSettingsAction,
  sendTestNotificationAction,
} from "@/app/(app)/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpDialog } from "@/components/ui/help-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export type OwnNotificationSettings = {
  notifyEnabled: boolean;
  notifyEmail: boolean;
  notifyTelegram: boolean;
  notifyWeekday: number;
  notifyHour: number;
  notifyMinute: number;
  telegramChatId: string | null;
};

/**
 * Local form state is only initialized from `settings` on mount, so the
 * caller must remount this component (e.g. `key={open}`) each time it's
 * opened — otherwise a previous edit or a stale `settings` prop would linger
 * across opens instead of reflecting what was actually saved.
 */
export function NotificationSettingsDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: OwnNotificationSettings;
}) {
  const [notifyEnabled, setNotifyEnabled] = useState(settings.notifyEnabled);
  const [notifyEmail, setNotifyEmail] = useState(settings.notifyEmail);
  const [notifyTelegram, setNotifyTelegram] = useState(settings.notifyTelegram);
  const [notifyWeekday, setNotifyWeekday] = useState(String(settings.notifyWeekday));
  const [notifyHour, setNotifyHour] = useState(String(settings.notifyHour));
  const [notifyMinute, setNotifyMinute] = useState(String(settings.notifyMinute));
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId ?? "");
  const [state, formAction, pending] = useActionState(updateOwnNotificationSettingsAction, undefined);
  const [testPending, startTest] = useTransition();
  const [testingChannel, setTestingChannel] = useState<NotifyChannel | null>(null);

  useEffect(() => {
    if (state?.success) {
      toast.success("Benachrichtigungseinstellungen gespeichert.");
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function runTest(channel: NotifyChannel) {
    setTestingChannel(channel);
    startTest(async () => {
      const result = await sendTestNotificationAction(channel, channel === "Telegram" ? telegramChatId : undefined);
      if (result.success) toast.success("Test-Benachrichtigung gesendet.");
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Benachrichtigungen</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              id="notifyEnabled"
              name="notifyEnabled"
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="notifyEnabled">Benachrichtigung aktiv</Label>
          </div>
          <div className={notifyEnabled ? "contents" : "hidden"}>
            <div className="flex flex-col gap-2">
              <Label>Kanal</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    id="notifyEmail"
                    name="notifyEmail"
                    type="checkbox"
                    checked={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="notifyEmail" className="font-normal">
                    E-Mail
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="notifyTelegram"
                    name="notifyTelegram"
                    type="checkbox"
                    checked={notifyTelegram}
                    onChange={(e) => setNotifyTelegram(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="notifyTelegram" className="font-normal">
                    Telegram
                  </Label>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notifyWeekday">Wochentag</Label>
              <Select name="notifyWeekday" value={notifyWeekday} onValueChange={setNotifyWeekday}>
                <SelectTrigger id="notifyWeekday" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((w, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notifyHour">Uhrzeit</Label>
              <div className="flex items-center gap-2">
                <Select name="notifyHour" value={notifyHour} onValueChange={setNotifyHour}>
                  <SelectTrigger id="notifyHour" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {String(h).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>:</span>
                <Select name="notifyMinute" value={notifyMinute} onValueChange={setNotifyMinute}>
                  <SelectTrigger id="notifyMinute" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINUTES.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {String(m).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground">
                z. B. 07:00 Uhr
              </span>
            </div>
            {notifyTelegram && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="telegramChatId" className="flex items-center gap-1">
                  Telegram Chat-ID
                  <HelpDialog title="Telegram Chat-ID finden" label="Hilfe zur Telegram Chat-ID">
                    <ol>
                      <li>
                        In Telegram nach dem Bot suchen (Benutzername vom Admin erfragen) und den
                        Chat mit <strong>&bdquo;Start&ldquo;</strong> bzw. <code>/start</code> öffnen — sonst
                        kann der Bot keine Nachrichten senden.
                      </li>
                      <li>
                        Die eigene Chat-ID herausfinden, z. B. per Chat mit{" "}
                        <strong>@userinfobot</strong> (zeigt die numerische ID direkt an).
                      </li>
                      <li>Die ID hier eintragen und mit &bdquo;Testen&ldquo; prüfen.</li>
                    </ol>
                  </HelpDialog>
                </Label>
                <Input
                  id="telegramChatId"
                  name="telegramChatId"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                />
              </div>
            )}
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter className="gap-2 sm:justify-between">
            {notifyEnabled && (
              <div className="flex gap-2">
                {notifyEmail && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testPending}
                    onClick={() => runTest("Email")}
                  >
                    {testPending && testingChannel === "Email" ? "Wird gesendet…" : "E-Mail testen"}
                  </Button>
                )}
                {notifyTelegram && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testPending || !telegramChatId}
                    onClick={() => runTest("Telegram")}
                  >
                    {testPending && testingChannel === "Telegram" ? "Wird gesendet…" : "Telegram testen"}
                  </Button>
                )}
              </div>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
