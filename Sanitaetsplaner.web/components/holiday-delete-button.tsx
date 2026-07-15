"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteHolidayAction } from "@/app/(app)/holidays/actions";
import { Button } from "@/components/ui/button";

export function HolidayDeleteButton({ id }: { id: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => startTransition(() => deleteHolidayAction(id))}
      aria-label="Feiertag löschen"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
