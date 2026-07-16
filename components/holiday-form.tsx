"use client";

import { useActionState } from "react";
import { createHolidayAction } from "@/app/(app)/holidays/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HolidayForm() {
  const [state, formAction, pending] = useActionState(createHolidayAction, undefined);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-base">Feiertag hinzufügen</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Datum</Label>
            <Input id="date" name="date" type="date" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
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
