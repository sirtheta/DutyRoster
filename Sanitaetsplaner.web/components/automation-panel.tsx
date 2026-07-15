"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateAutomationAction } from "@/app/(app)/calendar/[year]/actions";

export function AutomationPanel({ year }: { year: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const { count } = await generateAutomationAction(year);
      toast.success(`${count} Dienste für ${year} eingeplant.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dienste vergeben</CardTitle>
      </CardHeader>
      <CardContent>
        <Button size="sm" disabled={isPending} onClick={generate}>
          {isPending ? "Generiere…" : "Generieren"}
        </Button>
      </CardContent>
    </Card>
  );
}
