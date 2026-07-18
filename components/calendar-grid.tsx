"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TYPE_INFO } from "@/lib/entry-types";
import { datesOfYear, formatDateCH, isWeekend, toDateString, weekdayAbbr } from "@/lib/date";
import { bulkSetEntriesAction, moveEntryAction, moveEntriesAction } from "@/app/(app)/calendar/[year]/actions";
import { MONTH_NAMES, cellKey, parseCellKey } from "@/components/calendar/types";
import type { EntryRow, Move, PaintTool, UserRow } from "@/components/calendar/types";
import { useCalendarDrag } from "@/components/calendar/use-calendar-drag";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

interface CalendarGridProps {
  year: number;
  users: UserRow[];
  entries: EntryRow[];
  holidayNameByDate: Record<string, string>;
  /** Workdays that belong to a week with no S-duty at all — highlighted in the date header. */
  uncoveredDates?: Set<string>;
  currentUserId: number;
  role: UserRole;
}

export function CalendarGrid({
  year,
  users,
  entries,
  holidayNameByDate,
  uncoveredDates,
  currentUserId,
  role,
}: CalendarGridProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<PaintTool | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mobileGridRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Set right before a drag starts so the click that follows pointerup
  // (browsers fire it regardless of what pointer events did) doesn't also
  // toggle the drop-target cell's selection.
  const suppressClickRef = useRef(false);

  const entryMap = useMemo(() => {
    const map = new Map<string, EntryRow>();
    for (const e of entries) map.set(`${e.userId}-${e.date}`, e);
    return map;
  }, [entries]);

  const dates = useMemo(() => datesOfYear(year), [year]);
  // Only meaningful when the viewed year is the current one — a "today"
  // marker in a past/future year's grid would be misleading.
  const todayDate = useMemo(() => {
    const today = toDateString(new Date());
    return today.startsWith(`${year}-`) ? today : null;
  }, [year]);
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
  // A subtle, distinct pastel tint per user row so the eye can follow a row
  // across a wide, horizontally-scrolled year without losing track of which
  // user it belongs to. Golden-angle hue spacing keeps neighboring rows
  // visually distinct regardless of how many users there are.
  const rowTints = useMemo(
    () => users.map((_, i) => `oklch(0.7 0.09 ${(i * 137.508) % 360})`),
    [users]
  );
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

  // Editors may act on another user's cell if it's empty (it could become a
  // Dienst) or already holds one — everything else stays own-user-only,
  // mirroring the server-side check in assertEntryPermission.
  function canEdit(userId: number, entryType?: EntryType | null) {
    if (role === "Viewer") return false;
    if (role === "Admin") return true;
    if (userId === currentUserId) return true;
    return entryType == null || entryType === "S";
  }

  function clearSelection() {
    setSelection(new Set());
  }

  // Executes the moves computed by a finished drag; on success the selection
  // follows the cells to their new spot when the drag grabbed the selection.
  function performMoves(moves: Move[], keepSelection: boolean) {
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

  const {
    dragCells,
    selectPreview,
    dragPreview,
    handleCellPointerDown,
    handleCellPointerMove,
    handleCellPointerUp,
    handleCellPointerCancel,
  } = useCalendarDrag({
    users,
    dates,
    entryMap,
    userIndexById,
    dateIndexByDate,
    role,
    selection,
    setSelection,
    canEdit,
    suppressClickRef,
    onMoves: performMoves,
  });

  // Tap a cell to add it to the selection, tap it again to remove it —
  // works the same with mouse clicks and touch taps, no modifier key needed.
  // If a legend category is active instead, the tap paints the cell directly.
  function handleCellClick(userId: number, date: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const entry = entryMap.get(`${userId}-${date}`);
    if (!canEdit(userId, entry?.type)) return;
    if (activeTool !== null) {
      paintCell(userId, date, activeTool);
      return;
    }
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

  // Paints a single cell with the active legend tool. Skipped when it would
  // be a no-op (deleting an empty cell, or re-applying the same type).
  function paintCell(userId: number, date: string, tool: PaintTool) {
    const entry = entryMap.get(`${userId}-${date}`);
    const type = tool === "DELETE" ? null : tool;
    if (type === null ? !entry : entry?.type === type) return;
    startTransition(async () => {
      const res = await bulkSetEntriesAction([{ userId, date }], type);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  // Clicking a legend category applies it to the current selection if there
  // is one (existing bulk-apply flow); otherwise it toggles paint mode for
  // that category so subsequent cell clicks are coloured directly.
  function handleCategoryClick(type: EntryType) {
    if (selection.size > 0) {
      bulkApply(type);
      return;
    }
    setActiveTool((prev) => (prev === type ? null : type));
  }

  function handleDeleteToolClick() {
    if (selection.size > 0) {
      bulkApply(null);
      return;
    }
    setActiveTool((prev) => (prev === "DELETE" ? null : "DELETE"));
  }

  // Scroll today's column into view once when a year containing today is
  // opened — desktop and mobile each hold their own copy of the marked cell,
  // but only the one CSS currently shows (`hidden`/`md:hidden`) actually
  // scrolls; the other is a no-op since it isn't laid out.
  useEffect(() => {
    if (!todayDate) return;
    gridRef.current
      ?.querySelector<HTMLElement>("[data-today-cell]")
      ?.scrollIntoView({ inline: "center", block: "nearest" });
    mobileGridRef.current
      ?.querySelector<HTMLElement>("[data-today-cell]")
      ?.scrollIntoView({ inline: "center", block: "center" });
  }, [todayDate]);

  // Live sync: other users' mutations for this year arrive as SSE "change"
  // events (see app/api/calendar/[year]/stream), so we just refetch server
  // data instead of reconciling anything client-side.
  useEffect(() => {
    const source = new EventSource(`/api/calendar/${year}/stream`);
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [year, router]);

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
      if (selection.size === 0 && activeTool === null) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.size === 0) return;
        e.preventDefault();
        bulkApply(null);
      } else if (e.key === "Escape") {
        clearSelection();
        setActiveTool(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, activeTool]);

  const hasWeekendSelected = useMemo(
    () => [...(selectPreview ?? selection)].some((k) => isWeekend(parseCellKey(k).date)),
    [selection, selectPreview]
  );

  function renderDateHeaderCell(d: string, keyPrefix: string) {
    const weekend = isWeekend(d);
    const uncovered = uncoveredDates?.has(d) ?? false;
    const today = d === todayDate;
    return (
      <th
        key={`${keyPrefix}-${d}`}
        data-today-cell={today ? "" : undefined}
        className={cn(
          "min-w-[1.75rem] border-b border-l p-1 text-center font-normal text-muted-foreground",
          (holidayNameByDate[d] || weekend) && "bg-muted",
          uncovered && "bg-destructive/15 text-destructive",
          today && "bg-primary/20 font-semibold text-primary"
        )}
        title={holidayNameByDate[d] ?? (weekend ? "Wochenende" : uncovered ? "Ungedeckte Woche" : today ? "Heute" : undefined)}
      >
        <div className="text-[0.65rem] leading-none">{weekdayAbbr(d)}</div>
        <div>{parseInt(d.slice(8, 10), 10)}</div>
      </th>
    );
  }

  function renderDataCell(u: UserRow, d: string, rowTint: string) {
    const entry = entryMap.get(`${u.id}-${d}`);
    const info = entry ? TYPE_INFO[entry.type] : undefined;
    const isHoliday = !!holidayNameByDate[d];
    const weekend = isWeekend(d);
    const editable = canEdit(u.id, entry?.type);
    const draggable = editable && !!entry;
    const key = cellKey(u.id, d);
    // While a rubber-band drag is in progress, its live rectangle takes over
    // the highlight entirely (it replaces the committed selection on drop).
    const selected = selectPreview ? selectPreview.has(key) : selection.has(key);
    const isDragSource = dragCells?.some((c) => c.userId === u.id && c.date === d) ?? false;
    const previewValid = dragPreview?.valid.has(key) ?? false;
    const previewConflict = dragPreview?.conflict.has(key) ?? false;
    // Blend a thin sliver of the row's tint into empty cells only, so a row
    // stays traceable across a wide scroll — filled cells keep the entry
    // type's exact color so S/F/etc. look identical for every user.
    const baseBg = isHoliday || weekend ? "var(--muted)" : "var(--background)";
    const today = d === todayDate;
    let backgroundColor = info
      ? info.color
      : `color-mix(in oklch, ${baseBg} 88%, ${rowTint} 12%)`;
    // Nudge every cell in today's column toward the primary color so the
    // current day stands out as a column, on top of its normal type/row tint.
    if (today) backgroundColor = `color-mix(in oklch, ${backgroundColor} 78%, var(--primary) 22%)`;
    const cellStyle: CSSProperties = info
      ? { backgroundColor, color: info.textColor ?? "#fff" }
      : { backgroundColor };
    return (
      <td
        key={d}
        className={cn(
          "h-7 min-w-[1.75rem] border-b border-l p-0 text-center align-middle",
          editable && "cursor-pointer hover:opacity-80",
          // Touch browsers decide whether a touch will pan/scroll the page
          // right at touchstart, based on this CSS — not on anything our JS
          // does later. Without it, the browser commits to scrolling before
          // our long-press-to-drag timer ever gets a chance to run.
          draggable && "touch-none",
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
        style={cellStyle}
        title={entry?.comment ?? holidayNameByDate[d] ?? (weekend ? "Wochenende" : undefined)}
        data-user-id={u.id}
        data-date={d}
        onPointerDown={(e) => handleCellPointerDown(e, u.id, d, draggable, editable)}
        onPointerMove={handleCellPointerMove}
        onPointerUp={handleCellPointerUp}
        onPointerCancel={handleCellPointerCancel}
        onClick={() => handleCellClick(u.id, d)}
      >
        {entry?.type ?? ""}
      </td>
    );
  }

  return (
    <>
      <CalendarToolbar
        toolbarRef={toolbarRef}
        selectionSize={selection.size}
        displaySize={(selectPreview ?? selection).size}
        activeTool={activeTool}
        isPending={isPending}
        hasWeekendSelected={hasWeekendSelected}
        onCategoryClick={handleCategoryClick}
        onDeleteToolClick={handleDeleteToolClick}
        onCancel={() => {
          clearSelection();
          setActiveTool(null);
        }}
      />

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
                const uncovered = uncoveredDates?.has(d) ?? false;
                const today = d === todayDate;
                return (
                  <th
                    key={d}
                    data-today-cell={today ? "" : undefined}
                    className={cn(
                      "min-w-[1.75rem] border-b border-l p-1 text-center font-normal text-muted-foreground",
                      (holidayNameByDate[d] || weekend) && "bg-muted",
                      uncovered && "bg-destructive/15 text-destructive",
                      today && "bg-primary/20 font-semibold text-primary",
                      d.slice(5) === dates[0].slice(5) && "border-l-2"
                    )}
                    title={holidayNameByDate[d] ?? (weekend ? "Wochenende" : uncovered ? "Ungedeckte Woche" : today ? "Heute" : undefined)}
                  >
                    <div className="text-[0.65rem] leading-none">{weekdayAbbr(d)}</div>
                    <div>{parseInt(d.slice(8, 10), 10)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id}>
                <td
                  className="sticky left-0 z-10 border-b p-2 font-medium whitespace-nowrap"
                  style={{ backgroundColor: `color-mix(in oklch, var(--background) 78%, ${rowTints[i]} 22%)` }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {u.name}
                    {u.exitDate && (
                      <Badge variant="outline" title={`Ausgetreten am ${formatDateCH(u.exitDate)}`}>
                        Ausgetreten
                      </Badge>
                    )}
                  </span>
                </td>
                {dates.map((d) => renderDataCell(u, d, rowTints[i]))}
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
                  {users.map((u, i) => (
                    <tr key={u.id}>
                      <td
                        className="sticky left-0 z-10 border-b p-2 font-medium whitespace-nowrap"
                        style={{ backgroundColor: `color-mix(in oklch, var(--background) 78%, ${rowTints[i]} 22%)` }}
                      >
                        {u.name}
                      </td>
                      {m.dates.map((d) => renderDataCell(u, d, rowTints[i]))}
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
