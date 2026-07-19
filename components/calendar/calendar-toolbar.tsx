"use client";

import type { RefObject } from "react";
import type { EntryType } from "@prisma/client";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { Button } from "@/components/ui/button";
import type { PaintTool } from "./types";

export interface CalendarToolbarProps {
  toolbarRef: RefObject<HTMLDivElement | null>;
  /** Committed selection size — drives the Abbrechen button. */
  selectionSize: number;
  /** Size shown in the label; includes the live rubber-band preview. */
  displaySize: number;
  activeTool: PaintTool | null;
  isPending: boolean;
  hasWeekendSelected: boolean;
  onCategoryClick: (type: EntryType) => void;
  onDeleteToolClick: () => void;
  onCancel: () => void;
}

/**
 * Legend/toolbar: always visible. With an active selection, clicking a
 * category bulk-applies it to the selected cells. With no selection, clicking
 * a category instead arms it as a paint tool — subsequent cell clicks are
 * coloured with it directly until it's toggled off.
 */
export function CalendarToolbar({
  toolbarRef,
  selectionSize,
  displaySize,
  activeTool,
  isPending,
  hasWeekendSelected,
  onCategoryClick,
  onDeleteToolClick,
  onCancel,
}: CalendarToolbarProps) {
  return (
    <div
      ref={toolbarRef}
      className="sticky top-14 z-20 flex flex-col gap-2 rounded-md border bg-background p-2 shadow-sm"
    >
      <span className="text-sm tabular-nums text-muted-foreground">
        {displaySize > 0
          ? `${displaySize} Zelle(n) ausgewählt`
          : activeTool === "DELETE"
            ? "Zellen anklicken zum Löschen"
            : activeTool !== null
              ? "Zellen anklicken zum Einfärben"
              : "Legende"}
      </span>
      {displaySize === 0 && activeTool === null && (
        <span className="text-xs text-muted-foreground">
          Tipp: Shift + Ziehen markiert mehrere Zellen.
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {ENTRY_TYPES.map((type) => {
          const active = activeTool === type;
          return (
            <Button
              key={type}
              variant="outline"
              size="sm"
              disabled={isPending || (type === "S" && hasWeekendSelected)}
              onClick={() => onCategoryClick(type)}
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
          onClick={onDeleteToolClick}
        >
          Löschen
        </Button>
        {(selectionSize > 0 || activeTool !== null) && (
          <Button variant="ghost" size="sm" disabled={isPending} onClick={onCancel}>
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
