"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importHolidaysAction } from "@/app/(app)/holidays/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HolidayImportForm({ defaultYear }: { defaultYear: number }) {
  const [year, setYear] = useState(defaultYear);
  const [canton, setCanton] = useState("BE");
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-base">Feiertage importieren</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="import-year">Jahr</Label>
            <Input
              id="import-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="import-canton">Kanton</Label>
            <Input
              id="import-canton"
              value={canton}
              maxLength={2}
              onChange={(e) => setCanton(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const { count } = await importHolidaysAction(year, canton);
              toast.success(`${count} Feiertag(e) importiert.`);
            })
          }
        >
          {isPending ? "Importiere…" : "Importieren"}
        </Button>
      </CardContent>
    </Card>
  );
}
