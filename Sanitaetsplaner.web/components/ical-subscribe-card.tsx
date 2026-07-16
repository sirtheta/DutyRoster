"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { regenerateIcalTokenAction } from "@/app/(app)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function IcalSubscribeCard({ url }: { url: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Kalender-Abo (iCal)</CardTitle>
        <CardDescription>
          Diesen Link in Google/Apple/Outlook Kalender abonnieren, um deine Ferien und S-Dienste automatisch zu sehen.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              toast.success("Link kopiert.");
            }}
          >
            Kopieren
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await regenerateIcalTokenAction();
                toast.success("Neuer Link erstellt. Bitte Kalender-Abo aktualisieren.");
              })
            }
          >
            {isPending ? "Erstelle…" : "Link neu generieren"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Macht den bisherigen Link ungültig (z.&nbsp;B. falls er weitergegeben wurde).
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
