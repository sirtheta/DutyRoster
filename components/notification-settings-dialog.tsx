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

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export type OwnNotificationSettings = {
  notifyEnabled: boolean;
  notifyChannel: NotifyChannel;
  notifyWeekday: number;
  notifyHour: number;
  telegramChatId: string | null;
};

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
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>(settings.notifyChannel);
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId ?? "");
  const [state, formAction, pending] = useActionState(updateOwnNotificationSettingsAction, undefined);
  const [testPending, startTest] = useTransition();

  useEffect(() => {
    if (state?.success) toast.success("Benachrichtigungseinstellungen gespeichert.");
  }, [state]);

  function runTest() {
    startTest(async () => {
      const result = await sendTestNotificationAction(
        notifyChannel,
        notifyChannel === "Telegram" ? telegramChatId : undefined
      );
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
              <Label htmlFor="notifyChannel">Kanal</Label>
              <select
                id="notifyChannel"
                name="notifyChannel"
                value={notifyChannel}
                onChange={(e) => setNotifyChannel(e.target.value as NotifyChannel)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="Email">E-Mail</option>
                <option value="Telegram">Telegram</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notifyWeekday">Wochentag</Label>
              <select
                id="notifyWeekday"
                name="notifyWeekday"
                defaultValue={settings.notifyWeekday}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notifyHour">Uhrzeit (Stunde, 24h)</Label>
              <Input
                id="notifyHour"
                name="notifyHour"
                type="number"
                min={0}
                max={23}
                defaultValue={settings.notifyHour}
              />
              <span className="text-xs text-muted-foreground">
                z. B. 7 = 07:00 Uhr, lokale Zeit (Europe/Zurich)
              </span>
            </div>
            {notifyChannel === "Telegram" && (
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
              <Button
                type="button"
                variant="outline"
                disabled={testPending || (notifyChannel === "Telegram" && !telegramChatId)}
                onClick={runTest}
              >
                {testPending ? "Wird gesendet…" : "Testen"}
              </Button>
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
