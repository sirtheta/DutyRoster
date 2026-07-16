"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteHolidayAction, deleteHolidaysAction } from "@/app/(app)/holidays/actions";
import { Button } from "@/components/ui/button";

export function HolidayDeleteButton({ id }: { id: number | number[] }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() =>
        startTransition(() => (Array.isArray(id) ? deleteHolidaysAction(id) : deleteHolidayAction(id)))
      }
      aria-label="Feiertag löschen"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
