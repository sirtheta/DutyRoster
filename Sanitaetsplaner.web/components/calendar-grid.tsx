"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { datesOfYear, isWeekend } from "@/lib/date";
import { bulkSetEntriesAction, moveEntryAction } from "@/app/(app)/calendar/[year]/actions";
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
type Cell = { userId: number; date: string };

function cellKey(userId: number, date: string): string {
  return `${userId}|${date}`;
}

function parseCellKey(key: string): Cell {
  const [userId, date] = key.split("|");
  return { userId: Number(userId), date };
}

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
  const [dragSource, setDragSource] = useState<Cell | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const mobileGridRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  function clearSelection() {
    setSelection(new Set());
  }

  // Tap a cell to add it to the selection, tap it again to remove it —
  // works the same with mouse clicks and touch taps, no modifier key needed.
  function handleCellClick(userId: number, date: string) {
    if (!canEdit(userId)) return;
    const key = cellKey(userId, date);
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function bulkApply(type: EntryType | null) {
    const cells = [...selection].map(parseCellKey);
    if (cells.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetEntriesAction(cells, type);
      if (res.error) toast.error(res.error);
      else {
        toast.success(type === null ? `${res.count} Einträge gelöscht.` : `${res.count} Einträge gesetzt.`);
        router.refresh();
      }
      clearSelection();
    });
  }

  useEffect(() => {
    function handleDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        gridRef.current?.contains(target) ||
        mobileGridRef.current?.contains(target) ||
        toolbarRef.current?.contains(target)
      )
        return;
      clearSelection();
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (selection.size === 0) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        bulkApply(null);
      } else if (e.key === "Escape") {
        clearSelection();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

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

  const hasWeekendSelected = useMemo(
    () => [...selection].some((k) => isWeekend(parseCellKey(k).date)),
    [selection]
  );

  function renderDateHeaderCell(d: string, keyPrefix: string) {
    const weekend = isWeekend(d);
    return (
      <th
        key={`${keyPrefix}-${d}`}
        className={cn(
          "min-w-[1.75rem] border-b border-l p-1 text-center font-normal text-muted-foreground",
          (holidayNameByDate[d] || weekend) && "bg-muted"
        )}
        title={holidayNameByDate[d] ?? (weekend ? "Wochenende" : undefined)}
      >
        {parseInt(d.slice(8, 10), 10)}
      </th>
    );
  }

  function renderDataCell(u: UserRow, d: string) {
    const entry = entryMap.get(`${u.id}-${d}`);
    const info = entry ? TYPE_INFO[entry.type] : undefined;
    const isHoliday = !!holidayNameByDate[d];
    const weekend = isWeekend(d);
    const editable = canEdit(u.id);
    const draggable = editable && entry?.type === "S";
    const selected = selection.has(cellKey(u.id, d));
    return (
      <td
        key={d}
        className={cn(
          "h-7 min-w-[1.75rem] border-b border-l p-0 text-center align-middle",
          (isHoliday || weekend) && !entry && "bg-muted",
          editable && "cursor-pointer hover:opacity-80",
          // Layered white/black inset shadow instead of a colored ring so the
          // selection stays visible no matter the cell's own background color
          // (a colored ring disappears against a same-hued entry like "S").
          selected && "shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#0f172a]"
        )}
        style={info ? { backgroundColor: info.color, color: info.textColor ?? "#fff" } : undefined}
        title={entry?.comment ?? holidayNameByDate[d] ?? (weekend ? "Wochenende" : undefined)}
        draggable={draggable}
        onDragStart={() => draggable && setDragSource({ userId: u.id, date: d })}
        onDragOver={(e) => editable && e.preventDefault()}
        onDrop={() => editable && handleDrop(u.id, d)}
        onClick={() => handleCellClick(u.id, d)}
      >
        {entry?.type ?? ""}
      </td>
    );
  }

  return (
    <>
      {selection.size > 0 && (
        <div ref={toolbarRef} className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 shadow-sm">
          <span className="text-sm text-muted-foreground">{selection.size} Zelle(n) ausgewählt</span>
          {ENTRY_TYPES.map((type) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              disabled={isPending || (type === "S" && hasWeekendSelected)}
              onClick={() => bulkApply(type)}
              style={{ borderColor: TYPE_INFO[type].color, color: TYPE_INFO[type].color }}
              title={type === "S" && hasWeekendSelected ? "Kein Dienst an Wochenenden." : undefined}
            >
              {type} – {TYPE_INFO[type].label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => bulkApply(null)}>
            Löschen
          </Button>
          <Button variant="ghost" size="sm" disabled={isPending} onClick={clearSelection}>
            Abbrechen
          </Button>
        </div>
      )}

      {/* Desktop: full year in one scrollable table. */}
      <div ref={gridRef} className="hidden overflow-x-auto rounded-md border md:block">
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
              {dates.map((d) => {
                const weekend = isWeekend(d);
                return (
                  <th
                    key={d}
                    className={cn(
                      "min-w-[1.75rem] border-b border-l p-1 text-center font-normal text-muted-foreground",
                      (holidayNameByDate[d] || weekend) && "bg-muted",
                      d.slice(5) === dates[0].slice(5) && "border-l-2"
                    )}
                    title={holidayNameByDate[d] ?? (weekend ? "Wochenende" : undefined)}
                  >
                    {parseInt(d.slice(8, 10), 10)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="sticky left-0 z-10 border-b bg-background p-2 font-medium whitespace-nowrap">
                  {u.name}
                </td>
                {dates.map((d) => renderDataCell(u, d))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one table per month, stacked — no year-wide horizontal scroll. */}
      <div ref={mobileGridRef} className="flex flex-col gap-6 md:hidden">
        {months.map((m) => (
          <div key={m.month}>
            <h3 className="mb-2 text-sm font-semibold">
              {MONTH_NAMES[m.month]} {year}
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[8rem] border-b bg-background p-2 text-left">
                      Name
                    </th>
                    {m.dates.map((d) => renderDateHeaderCell(d, `m${m.month}`))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="sticky left-0 z-10 border-b bg-background p-2 font-medium whitespace-nowrap">
                        {u.name}
                      </td>
                      {m.dates.map((d) => renderDataCell(u, d))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
