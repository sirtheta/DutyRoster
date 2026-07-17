"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { datesOfYear, isWeekend, weekdayAbbr } from "@/lib/date";
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
// The category currently selected in the always-visible legend. While set,
// clicking a cell paints it directly instead of toggling the selection.
type PaintTool = EntryType | "DELETE";

function cellKey(userId: number, date: string): string {
  return `${userId}|${date}`;
}

function parseCellKey(key: string): Cell {
  const [userId, date] = key.split("|");
  return { userId: Number(userId), date };
}

// Dragging is driven by Pointer Events rather than native HTML5 DnD, since
// the latter has no touch equivalent. Mouse drags start as soon as the
// pointer moves past a small threshold; touch/pen require a brief long-press
// first so an ordinary scroll gesture isn't hijacked.
const DRAG_MOVE_THRESHOLD = 8;
const LONG_PRESS_MS = 300;
const LONG_PRESS_MOVE_TOLERANCE = 10;

type DragPointerState = {
  pointerId: number;
  // "move" relocates an existing entry (grabbed from an occupied cell);
  // "select" rubber-bands a rectangular range of cells to bulk-apply a type
  // to. Only "move" is available on touch/pen — "select" is mouse-only so it
  // never fights with scrolling on mobile.
  mode: "move" | "select";
  userId: number;
  date: string;
  startX: number;
  startY: number;
  pointerType: string;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  started: boolean;
};

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
  // Endpoints of an in-progress rubber-band drag-select (mouse only). While
  // set, the rectangle between them drives the live selection preview;
  // committed to `selection` on pointer up.
  const [selectAnchor, setSelectAnchor] = useState<Cell | null>(null);
  const [selectHover, setSelectHover] = useState<Cell | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<PaintTool | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mobileGridRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<DragPointerState | null>(null);
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

  // All editable cells in the rectangle spanned by two corner cells —
  // the core of drag-to-select. Non-editable cells inside the rectangle
  // (e.g. another user's Ferien when the current user is an Editor) are
  // silently excluded rather than blocking the whole selection.
  function rectKeysBetween(a: Cell, b: Cell): Set<string> {
    const keys = new Set<string>();
    const ai = userIndexById.get(a.userId);
    const bi = userIndexById.get(b.userId);
    const adi = dateIndexByDate.get(a.date);
    const bdi = dateIndexByDate.get(b.date);
    if (ai == null || bi == null || adi == null || bdi == null) return keys;
    const [uLo, uHi] = ai <= bi ? [ai, bi] : [bi, ai];
    const [dLo, dHi] = adi <= bdi ? [adi, bdi] : [bdi, adi];
    for (let ui = uLo; ui <= uHi; ui++) {
      const user = users[ui];
      for (let di = dLo; di <= dHi; di++) {
        const date = dates[di];
        const entry = entryMap.get(`${user.id}-${date}`);
        if (!canEdit(user.id, entry?.type)) continue;
        keys.add(cellKey(user.id, date));
      }
    }
    return keys;
  }

  function handleSelectDragStart(userId: number, date: string) {
    setSelectAnchor({ userId, date });
    setSelectHover({ userId, date });
  }

  function handleSelectOverCell(userId: number, date: string) {
    setSelectHover((prev) => (prev && prev.userId === userId && prev.date === date ? prev : { userId, date }));
  }

  // Commits the rectangle between the drag's start cell and its final
  // position directly (rather than trusting `selectHover` state, which may
  // not have flushed yet at pointer-up time).
  function commitSelectDrag(anchor: Cell, target: Cell) {
    const keys = rectKeysBetween(anchor, target);
    if (keys.size > 0) setSelection(keys);
    setSelectAnchor(null);
    setSelectHover(null);
  }

  function handleSelectDragCancel() {
    setSelectAnchor(null);
    setSelectHover(null);
  }

  // Live rectangle preview shown while a select-drag is in progress; replaces
  // (rather than merges into) any prior selection once the drag finishes.
  const selectPreview = useMemo(() => {
    if (!selectAnchor || !selectHover) return null;
    return rectKeysBetween(selectAnchor, selectHover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectAnchor, selectHover, userIndexById, dateIndexByDate, users, dates, entryMap]);

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
      // Cross-user moves are only ever valid for S-Dienst entries (enforced
      // server-side too), regardless of who owns the source cell.
      const sourceType = entryMap.get(`${c.userId}-${c.date}`)?.type;
      const forbiddenUserChange = role !== "Admin" && targetUser.id !== c.userId && sourceType !== "S";
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

  // Finds the calendar cell under an absolute point on screen, used while
  // dragging since pointer capture keeps move/up events targeted at the cell
  // the drag started on rather than whatever is currently under the pointer.
  function cellFromPoint(x: number, y: number): Cell | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cellEl = el?.closest("td[data-user-id]") as HTMLElement | null;
    if (!cellEl?.dataset.date) return null;
    const userId = Number(cellEl.dataset.userId);
    if (Number.isNaN(userId)) return null;
    return { userId, date: cellEl.dataset.date };
  }

  function handleCellPointerDown(
    e: ReactPointerEvent<HTMLTableCellElement>,
    userId: number,
    date: string,
    draggable: boolean,
    editable: boolean
  ) {
    // Occupied cells always start a "move" drag (any pointer type, as
    // before). Empty/editable cells start a "select" drag, but only for the
    // mouse — on touch/pen those cells stay scrollable, same as today.
    const isMouseSelect = !draggable && editable && e.pointerType === "mouse";
    if (!draggable && !isMouseSelect) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const mode: DragPointerState["mode"] = draggable ? "move" : "select";
    const state: DragPointerState = {
      pointerId: e.pointerId,
      mode,
      userId,
      date,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      longPressTimer: null,
      started: false,
    };
    if (e.pointerType !== "mouse") {
      state.longPressTimer = setTimeout(() => {
        if (dragPointerRef.current === state) {
          state.started = true;
          suppressClickRef.current = true;
          handleDragStart(userId, date);
        }
      }, LONG_PRESS_MS);
    }
    dragPointerRef.current = state;
  }

  function handleCellPointerMove(e: ReactPointerEvent<HTMLTableCellElement>) {
    const state = dragPointerRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);

    if (!state.started) {
      if (state.pointerType === "mouse") {
        if (dist > DRAG_MOVE_THRESHOLD) {
          state.started = true;
          suppressClickRef.current = true;
          if (state.mode === "move") handleDragStart(state.userId, state.date);
          else handleSelectDragStart(state.userId, state.date);
        }
      } else if (dist > LONG_PRESS_MOVE_TOLERANCE && state.longPressTimer) {
        // Moved too far before the long-press fired — let it scroll instead.
        clearTimeout(state.longPressTimer);
        dragPointerRef.current = null;
        return;
      }
    }

    if (state.started) {
      e.preventDefault();
      const target = cellFromPoint(e.clientX, e.clientY);
      if (target) {
        if (state.mode === "move") handleDragOverCell(target.userId, target.date);
        else handleSelectOverCell(target.userId, target.date);
      }
    }
  }

  function handleCellPointerUp(e: ReactPointerEvent<HTMLTableCellElement>) {
    const state = dragPointerRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (state.longPressTimer) clearTimeout(state.longPressTimer);
    dragPointerRef.current = null;
    if (state.started) {
      const target = cellFromPoint(e.clientX, e.clientY);
      if (state.mode === "move") {
        if (target) handleDrop(target.userId, target.date);
        else handleDragEnd();
      } else {
        commitSelectDrag({ userId: state.userId, date: state.date }, target ?? { userId: state.userId, date: state.date });
      }
    }
  }

  function handleCellPointerCancel(e: ReactPointerEvent<HTMLTableCellElement>) {
    const state = dragPointerRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (state.longPressTimer) clearTimeout(state.longPressTimer);
    dragPointerRef.current = null;
    if (state.started) {
      if (state.mode === "move") handleDragEnd();
      else handleSelectDragCancel();
    }
  }

  const hasWeekendSelected = useMemo(
    () => [...(selectPreview ?? selection)].some((k) => isWeekend(parseCellKey(k).date)),
    [selection, selectPreview]
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
    // Blend a thin sliver of the row's tint into every cell's own color
    // (entry-type color, or muted/background for empty cells) so a row stays
    // traceable across a wide scroll without drowning out the type colors.
    const baseBg = isHoliday || weekend ? "var(--muted)" : "var(--background)";
    const cellStyle: CSSProperties = info
      ? { backgroundColor: `color-mix(in oklch, ${info.color} 85%, ${rowTint} 15%)`, color: info.textColor ?? "#fff" }
      : { backgroundColor: `color-mix(in oklch, ${baseBg} 88%, ${rowTint} 12%)` };
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
      {/* Legend/toolbar: always visible. With an active selection, clicking a
          category bulk-applies it to the selected cells. With no selection,
          clicking a category instead arms it as a paint tool — subsequent
          cell clicks are coloured with it directly until it's toggled off. */}
      <div
        ref={toolbarRef}
        className="sticky top-0 z-20 flex flex-col gap-2 rounded-md border bg-background p-2 shadow-sm"
      >
        <span className="text-sm tabular-nums text-muted-foreground">
          {(selectPreview ?? selection).size > 0
            ? `${(selectPreview ?? selection).size} Zelle(n) ausgewählt`
            : activeTool === "DELETE"
              ? "Zellen anklicken zum Löschen"
              : activeTool !== null
                ? "Zellen anklicken zum Einfärben"
                : "Legende"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {ENTRY_TYPES.map((type) => {
            const active = activeTool === type;
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                disabled={isPending || (type === "S" && hasWeekendSelected)}
                onClick={() => handleCategoryClick(type)}
                style={
                  active
                    ? {
                        backgroundColor: TYPE_INFO[type].color,
                        color: TYPE_INFO[type].textColor ?? "#fff",
                        borderColor: TYPE_INFO[type].color,
                      }
                    : { borderColor: TYPE_INFO[type].color, color: TYPE_INFO[type].color }
                }
                title={type === "S" && hasWeekendSelected ? "Kein Dienst an Wochenenden." : undefined}
              >
                {type} – {TYPE_INFO[type].label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeTool === "DELETE" ? "default" : "ghost"}
            size="sm"
            disabled={isPending}
            onClick={handleDeleteToolClick}
          >
            Löschen
          </Button>
          {(selection.size > 0 || activeTool !== null) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                clearSelection();
                setActiveTool(null);
              }}
            >
              Abbrechen
            </Button>
          )}
        </div>
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
                  {u.name}
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
