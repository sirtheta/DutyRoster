"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { toast } from "sonner";
import type { EntryType, UserRole } from "@prisma/client";
import { isWeekend } from "@/lib/date";
import { cellKey, parseCellKey } from "./types";
import type { Cell, EntryRow, Move, UserRow } from "./types";

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

export interface CalendarDragArgs {
  users: UserRow[];
  dates: string[];
  entryMap: Map<string, EntryRow>;
  userIndexById: Map<number, number>;
  dateIndexByDate: Map<string, number>;
  role: UserRole;
  selection: Set<string>;
  setSelection: (next: Set<string>) => void;
  canEdit: (userId: number, entryType?: EntryType | null) => boolean;
  /** Set right before a drag starts so the click after pointerup is swallowed. */
  suppressClickRef: RefObject<boolean>;
  /** Executes the computed moves (server action + toast + refresh). */
  onMoves: (moves: Move[], keepSelection: boolean) => void;
}

/**
 * Pointer-event state machine for the calendar grid's two drag gestures:
 * moving entries (single or whole selection) and mouse rubber-band selection.
 * Returns the live previews plus the pointer handlers to spread onto cells.
 */
export function useCalendarDrag({
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
  onMoves,
}: CalendarDragArgs) {
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
  // committed to the selection on pointer up.
  const [selectAnchor, setSelectAnchor] = useState<Cell | null>(null);
  const [selectHover, setSelectHover] = useState<Cell | null>(null);
  const dragPointerRef = useRef<DragPointerState | null>(null);

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

    const moves: Move[] = [];
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

    onMoves(moves, keepSelection);
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

  return {
    dragCells,
    selectPreview,
    dragPreview,
    handleCellPointerDown,
    handleCellPointerMove,
    handleCellPointerUp,
    handleCellPointerCancel,
  };
}
