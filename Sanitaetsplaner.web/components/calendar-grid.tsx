"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { datesOfYear } from "@/lib/date";
import { upsertEntryAction, moveEntryAction } from "@/app/(app)/calendar/[year]/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

type EntryRow = {
  id: number;
  userId: number;
  date: string;
  type: EntryType;
  source: string;
  comment: string | null;
};

type UserRow = { id: number; name: string; rotationOrder: number };

interface CalendarGridProps {
  year: number;
  users: UserRow[];
  entries: EntryRow[];
  holidayNameByDate: Record<string, string>;
  currentUserId: number;
  role: UserRole;
}

export function CalendarGrid({
  year,
  users,
  entries,
  holidayNameByDate,
  currentUserId,
  role,
}: CalendarGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{ userId: number; date: string } | null>(null);
  const [dragSource, setDragSource] = useState<{ userId: number; date: string } | null>(null);

  const entryMap = useMemo(() => {
    const map = new Map<string, EntryRow>();
    for (const e of entries) map.set(`${e.userId}-${e.date}`, e);
    return map;
  }, [entries]);

  const dates = useMemo(() => datesOfYear(year), [year]);
  const months = useMemo(() => {
    const groups: { month: number; dates: string[] }[] = [];
    for (const d of dates) {
      const month = parseInt(d.slice(5, 7), 10) - 1;
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.dates.push(d);
      else groups.push({ month, dates: [d] });
    }
    return groups;
  }, [dates]);

  function canEdit(userId: number) {
    if (role === "Viewer") return false;
    if (role === "Admin") return true;
    return userId === currentUserId;
  }

  function handleDrop(targetUserId: number, targetDate: string) {
    if (!dragSource) return;
    const source = dragSource;
    setDragSource(null);
    if (source.userId === targetUserId && source.date === targetDate) return;
    startTransition(async () => {
      const res = await moveEntryAction({
        fromUserId: source.userId,
        fromDate: source.date,
        toUserId: targetUserId,
        toDate: targetDate,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Dienst verschoben.");
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[10rem] border-b bg-background p-2 text-left">
                Name
              </th>
              {months.map((m) => (
                <th
                  key={m.month}
                  colSpan={m.dates.length}
                  className="border-b border-l p-1 text-center font-medium"
                >
                  {MONTH_NAMES[m.month]}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 border-b bg-background p-1" />
              {dates.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "min-w-[1.75rem] border-b border-l p-1 text-center font-normal text-muted-foreground",
                    holidayNameByDate[d] && "bg-muted",
                    d.slice(5) === dates[0].slice(5) && "border-l-2"
                  )}
                  title={holidayNameByDate[d]}
                >
                  {parseInt(d.slice(8, 10), 10)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="sticky left-0 z-10 border-b bg-background p-2 font-medium whitespace-nowrap">
                  {u.name}
                </td>
                {dates.map((d) => {
                  const entry = entryMap.get(`${u.id}-${d}`);
                  const info = entry ? TYPE_INFO[entry.type] : undefined;
                  const isHoliday = !!holidayNameByDate[d];
                  const editable = canEdit(u.id);
                  const draggable = editable && entry?.type === "S";
                  return (
                    <td
                      key={d}
                      className={cn(
                        "h-7 min-w-[1.75rem] border-b border-l p-0 text-center align-middle",
                        isHoliday && !entry && "bg-muted",
                        editable && "cursor-pointer hover:opacity-80"
                      )}
                      style={info ? { backgroundColor: info.color, color: info.textColor ?? "#fff" } : undefined}
                      title={entry?.comment ?? holidayNameByDate[d] ?? undefined}
                      draggable={draggable}
                      onDragStart={() => draggable && setDragSource({ userId: u.id, date: d })}
                      onDragOver={(e) => editable && e.preventDefault()}
                      onDrop={() => editable && handleDrop(u.id, d)}
                      onClick={() => editable && setEditing({ userId: u.id, date: d })}
                    >
                      {entry?.type ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EntryEditorDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        cell={editing}
        current={editing ? entryMap.get(`${editing.userId}-${editing.date}`) : undefined}
        isPending={isPending}
        onSave={(type) => {
          if (!editing) return;
          const cell = editing;
          setEditing(null);
          startTransition(async () => {
            const res = await upsertEntryAction({ userId: cell.userId, date: cell.date, type });
            if (res.error) toast.error(res.error);
            else router.refresh();
          });
        }}
      />
    </>
  );
}

function EntryEditorDialog({
  open,
  onOpenChange,
  cell,
  current,
  isPending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cell: { userId: number; date: string } | null;
  current: EntryRow | undefined;
  isPending: boolean;
  onSave: (type: EntryType | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eintrag {cell?.date}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {ENTRY_TYPES.map((type) => (
            <Button
              key={type}
              variant={current?.type === type ? "default" : "outline"}
              size="sm"
              disabled={isPending}
              onClick={() => onSave(type)}
              style={
                current?.type !== type
                  ? { borderColor: TYPE_INFO[type].color, color: TYPE_INFO[type].color }
                  : undefined
              }
            >
              {type} – {TYPE_INFO[type].label}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={() => onSave(null)}>
            Eintrag löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
