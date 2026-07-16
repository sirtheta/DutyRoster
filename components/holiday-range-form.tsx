"use client";

import { useActionState } from "react";
import { createHolidayRangeAction } from "@/app/(app)/holidays/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function HolidayRangeForm() {
  const [state, formAction, pending] = useActionState(createHolidayRangeAction, undefined);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-base">Betriebsferien erfassen</CardTitle>
        <CardDescription>Erstellt für jeden Tag im Zeitraum einen Feiertag-Eintrag.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="from">Von</Label>
            <Input id="from" name="from" type="date" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="to">Bis</Label>
            <Input id="to" name="to" type="date" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="range-name">Name</Label>
            <Input id="range-name" name="name" defaultValue="Betriebsferien" required />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Speichern…" : "Hinzufügen"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
