import { EventEmitter } from "events";

// Single in-memory event bus for the one Node process this app runs in — no
// external pub/sub needed. Cached on globalThis so dev hot-reload doesn't
// spawn a fresh emitter (and orphan any open SSE listeners), same pattern as
// lib/prisma.ts.
const globalForEvents = globalThis as unknown as { calendarEvents?: EventEmitter };

export const calendarEvents = globalForEvents.calendarEvents ?? new EventEmitter();
calendarEvents.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalForEvents.calendarEvents = calendarEvents;
}

export function notifyCalendarChange(year: string | number): void {
  calendarEvents.emit("change", String(year));
}
