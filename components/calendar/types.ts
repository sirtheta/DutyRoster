import type { EntryType } from "@prisma/client";

export const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export type EntryRow = {
  id: number;
  userId: number;
  date: string;
  type: EntryType;
  source: string;
  comment: string | null;
};

export type UserRow = { id: number; name: string; rotationOrder: number; exitDate: string | null };
export type Cell = { userId: number; date: string };
// The category currently selected in the always-visible legend. While set,
// clicking a cell paints it directly instead of toggling the selection.
export type PaintTool = EntryType | "DELETE";

export type Move = { fromUserId: number; fromDate: string; toUserId: number; toDate: string };

export function cellKey(userId: number, date: string): string {
  return `${userId}|${date}`;
}

export function parseCellKey(key: string): Cell {
  const [userId, date] = key.split("|");
  return { userId: Number(userId), date };
}
