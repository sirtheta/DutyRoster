"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  previewAutomationAction,
  applyAutomationAction,
  type Assignment,
} from "@/app/(app)/calendar/[year]/actions";

export function AutomationPanel({ year }: { year: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Assignment[] | null>(null);

  const summary = useMemo(() => {
    if (!preview) return null;
    const counts = new Map<number, number>();
    for (const a of preview) counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
    return counts;
  }, [preview]);

  function runPreview() {
    startTransition(async () => {
      const result = await previewAutomationAction(year);
      setPreview(result);
      toast.info(`${result.length} S-Dienst-Tage für ${year} vorgeschlagen.`);
    });
  }

  function apply() {
    if (!preview) return;
    startTransition(async () => {
      const { count } = await applyAutomationAction(year, preview);
      toast.success(`${count} Einträge übernommen.`);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dienste vergeben</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button size="sm" disabled={isPending} onClick={runPreview}>
            Vorschau berechnen
          </Button>
          {preview && (
            <>
              <Button size="sm" variant="default" disabled={isPending} onClick={apply}>
                Übernehmen
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setPreview(null)}>
                Verwerfen
              </Button>
            </>
          )}
        </div>
        {summary && (
          <p className="text-sm text-muted-foreground">
            {[...summary.entries()].map(([userId, count]) => `Benutzer #${userId}: ${count} Tage`).join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
