"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { triggerNotificationCheck } from "@/app/(app)/settings/actions";

export function DevToolsCard() {
  const [state, action, pending] = useActionState(() => triggerNotificationCheck(), undefined);

  useEffect(() => {
    if (state?.success) toast.success(`Benachrichtigungscheck abgeschlossen (${state.queued ?? 0} neu eingereiht).`);
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className="border-dashed border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-amber-700 dark:text-amber-400">Dev-Tools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Nur in Entwicklungsumgebungen sichtbar.</p>
        <form action={action}>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Wird ausgeführt…" : "Benachrichtigungscheck jetzt auslösen"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Führt queueDueNotifications (erzwungen, ignoriert Wochentag/Stunde) und dispatchPendingNotifications aus —
          sendet echte E-Mail- und Telegram-Benachrichtigungen an fällige Nutzer.
        </p>
      </CardContent>
    </Card>
  );
}
