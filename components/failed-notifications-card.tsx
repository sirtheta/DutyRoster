"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { retryFailedNotificationsAction } from "@/app/(app)/settings/actions";

export interface FailedNotificationRow {
  id: number;
  userName: string;
  channel: string;
  failedAtLabel: string;
  attempts: number;
  error: string | null;
}

export function FailedNotificationsCard({
  failures,
  maxAttempts,
}: {
  failures: FailedNotificationRow[];
  maxAttempts: number;
}) {
  const [state, action, pending] = useActionState(() => retryFailedNotificationsAction(), undefined);

  useEffect(() => {
    if (state?.count !== undefined)
      toast.success(`${state.count} Benachrichtigung(en) erneut eingereiht.`);
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-destructive">
          Fehlgeschlagene Benachrichtigungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Diese Benachrichtigungen konnten nicht zugestellt werden. Nach {maxAttempts} Versuchen
          wird nicht mehr automatisch wiederholt — nach Behebung der Ursache (z.&nbsp;B.
          SMTP-Einstellungen) können sie hier erneut ausgelöst werden.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeitpunkt</TableHead>
                <TableHead>Benutzer</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Versuche</TableHead>
                <TableHead>Fehler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap">{f.failedAtLabel}</TableCell>
                  <TableCell>{f.userName}</TableCell>
                  <TableCell>{f.channel}</TableCell>
                  <TableCell>
                    {f.attempts}/{maxAttempts}
                  </TableCell>
                  <TableCell className="max-w-[24rem] truncate" title={f.error ?? undefined}>
                    {f.error}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <form action={action}>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Wird ausgeführt…" : "Alle erneut versuchen"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
