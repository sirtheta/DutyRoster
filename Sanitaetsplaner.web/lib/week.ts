import { toDateString, addDays, weekday } from "@/lib/date";

/** Monday..Sunday range (YYYY-MM-DD, inclusive) of the week containing `date`. */
export function weekRange(date: Date): { start: string; end: string } {
  const today = toDateString(date);
  const dow = weekday(today); // 0=So ... 6=Sa
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(today, -daysSinceMonday);
  const end = addDays(start, 6);
  return { start, end };
}
