"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateIcalTokenAction, updateIcalIncludeVacationAction } from "@/app/(app)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function IcalSubscribeCard({ url, includeVacation }: { url: string; includeVacation: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [isTogglePending, startToggle] = useTransition();
  const [checked, setChecked] = useState(includeVacation);

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
          <input
            id="icalIncludeVacation"
            type="checkbox"
            checked={checked}
            disabled={isTogglePending}
            onChange={(e) => {
              const next = e.target.checked;
              setChecked(next);
              startToggle(async () => {
                await updateIcalIncludeVacationAction(next);
                toast.success("Einstellung gespeichert.");
              });
            }}
            className="h-4 w-4"
          />
          <Label htmlFor="icalIncludeVacation" className="font-normal">
            Ferien im Feed anzeigen
          </Label>
          <span className="text-xs text-muted-foreground">(sonst nur S-Dienste)</span>
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
