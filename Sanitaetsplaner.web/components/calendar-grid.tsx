"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { datesOfYear, isWeekend } from "@/lib/date";
import { bulkSetEntriesAction, moveEntryAction, moveEntriesAction } from "@/app/(app)/calendar/[year]/actions";
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
  // The full set of cells being dragged (the selection, if the drag started
  // on a selected cell and more than one is selected; otherwise just that cell).
  const [dragCells, setDragCells] = useState<Cell[] | null>(null);
  const [dragAnchor, setDragAnchor] = useState<Cell | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  // Whether the current drag was grabbed from the selection — if so, the
  // selection follows the cells to their new spot so the user can keep
  // nudging the same group without re-selecting it.
  const [dragFromSelection, setDragFromSelection] = useState(false);
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
  const userIndexById = useMemo(() => {
    const map = new Map<number, number>();
    users.forEach((u, i) => map.set(u.id, i));
    return map;
  }, [users]);
  const dateIndexByDate = useMemo(() => {
    const map = new Map<string, number>();
    dates.forEach((d, i) => map.set(d, i));
    return map;
  }, [dates]);
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

  // Grabbing a cell that's part of a multi-selection drags the whole
  // selection together, keeping each cell's offset from the grabbed one.
  function handleDragStart(userId: number, date: string) {
    const anchor = { userId, date };
    const key = cellKey(userId, date);
    const fromSelection = selection.has(key);
    const cells = fromSelection ? [...selection].map(parseCellKey) : [anchor];
    setDragAnchor(anchor);
    setDragCells(cells);
    setHoverCell(anchor);
    setDragFromSelection(fromSelection);
  }

  function handleDragOverCell(userId: number, date: string) {
    setHoverCell((prev) => (prev && prev.userId === userId && prev.date === date ? prev : { userId, date }));
  }

  function handleDragEnd() {
    setDragCells(null);
    setDragAnchor(null);
    setHoverCell(null);
    setDragFromSelection(false);
  }

  // Live preview of where the dragged cells would land, computed from the
  // offset between the grabbed cell and the cell currently hovered over.
  const dragPreview = useMemo(() => {
    if (!dragCells || !dragAnchor || !hoverCell) return null;
    const anchorUserIdx = userIndexById.get(dragAnchor.userId);
    const anchorDateIdx = dateIndexByDate.get(dragAnchor.date);
    const hoverUserIdx = userIndexById.get(hoverCell.userId);
    const hoverDateIdx = dateIndexByDate.get(hoverCell.date);
    if (anchorUserIdx == null || anchorDateIdx == null || hoverUserIdx == null || hoverDateIdx == null) {
      return null;
    }
    const dUser = hoverUserIdx - anchorUserIdx;
    const dDate = hoverDateIdx - anchorDateIdx;

    const sourceKeys = new Set(dragCells.map((c) => cellKey(c.userId, c.date)));
    const valid = new Set<string>();
    const conflict = new Set<string>();
    for (const c of dragCells) {
      const ui = userIndexById.get(c.userId);
      const di = dateIndexByDate.get(c.date);
      if (ui == null || di == null) return null;
      const targetUser = users[ui + dUser];
      const targetDate = dates[di + dDate];
      if (!targetUser || !targetDate) return null;
      const key = cellKey(targetUser.id, targetDate);
      const occupied = entryMap.has(`${targetUser.id}-${targetDate}`) && !sourceKeys.has(key);
      const forbiddenUserChange = role !== "Admin" && targetUser.id !== c.userId;
      if (occupied || isWeekend(targetDate) || forbiddenUserChange) conflict.add(key);
      else valid.add(key);
    }
    return { valid, conflict };
  }, [dragCells, dragAnchor, hoverCell, userIndexById, dateIndexByDate, users, dates, entryMap, role]);

  function handleDrop(targetUserId: number, targetDate: string) {
    if (!dragCells || !dragAnchor) return;
    const cells = dragCells;
    const anchor = dragAnchor;
    const keepSelection = dragFromSelection;
    handleDragEnd();

    const anchorUserIdx = userIndexById.get(anchor.userId);
    const anchorDateIdx = dateIndexByDate.get(anchor.date);
    const targetUserIdx = userIndexById.get(targetUserId);
    const targetDateIdx = dateIndexByDate.get(targetDate);
    if (anchorUserIdx == null || anchorDateIdx == null || targetUserIdx == null || targetDateIdx == null) return;
    const dUser = targetUserIdx - anchorUserIdx;
    const dDate = targetDateIdx - anchorDateIdx;
    if (dUser === 0 && dDate === 0) return;

    const moves: { fromUserId: number; fromDate: string; toUserId: number; toDate: string }[] = [];
    for (const c of cells) {
      const ui = userIndexById.get(c.userId);
      const di = dateIndexByDate.get(c.date);
      if (ui == null || di == null) return;
      const toUser = users[ui + dUser];
      const toDate = dates[di + dDate];
      if (!toUser || !toDate) {
        toast.error("Zielbereich liegt ausserhalb des Kalenders.");
        return;
      }
      moves.push({ fromUserId: c.userId, fromDate: c.date, toUserId: toUser.id, toDate });
    }

    startTransition(async () => {
      const movedSelection = keepSelection
        ? new Set(moves.map((m) => cellKey(m.toUserId, m.toDate)))
        : null;
      if (moves.length === 1) {
        const res = await moveEntryAction(moves[0]);
        if (res.error) toast.error(res.error);
        else {
          toast.success("Dienst verschoben.");
          if (movedSelection) setSelection(movedSelection);
          router.refresh();
        }
      } else {
        const res = await moveEntriesAction(moves);
        if (res.error) toast.error(res.error);
        else {
          toast.success(`${res.count ?? moves.length} Dienste verschoben.`);
          if (movedSelection) setSelection(movedSelection);
          router.refresh();
        }
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
    const key = cellKey(u.id, d);
    const selected = selection.has(key);
    const isDragSource = dragCells?.some((c) => c.userId === u.id && c.date === d) ?? false;
    const previewValid = dragPreview?.valid.has(key) ?? false;
    const previewConflict = dragPreview?.conflict.has(key) ?? false;
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
          selected && "shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#0f172a]",
          isDragSource && "opacity-40",
          // Live drop preview: blue outline where the drag would land, red
          // where that would fail (occupied, weekend, or not permitted).
          previewValid && "shadow-[inset_0_0_0_2px_#2563eb]",
          previewConflict && "shadow-[inset_0_0_0_2px_#dc2626]"
        )}
        style={info ? { backgroundColor: info.color, color: info.textColor ?? "#fff" } : undefined}
        title={entry?.comment ?? holidayNameByDate[d] ?? (weekend ? "Wochenende" : undefined)}
        draggable={draggable}
        onDragStart={() => draggable && handleDragStart(u.id, d)}
        onDragOver={(e) => {
          if (!editable) return;
          e.preventDefault();
          if (dragCells) handleDragOverCell(u.id, d);
        }}
        onDrop={() => editable && handleDrop(u.id, d)}
        onDragEnd={handleDragEnd}
        onClick={() => handleCellClick(u.id, d)}
      >
        {entry?.type ?? ""}
      </td>
    );
  }

  return (
    <>
      {/* Always rendered (even with no selection) and just hidden via
          `invisible`, so it reserves its height at all times — otherwise it
          popping in/out shifts the grid underneath and rows jump around
          right when the user is trying to click cells. */}
      <div
        ref={toolbarRef}
        className={cn(
          "sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 shadow-sm",
          selection.size === 0 && "invisible"
        )}
      >
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
