import { createWriteStream, mkdirSync, writeSync } from "fs";
import { dirname, join } from "path";

/**
 * Log file directory, next to the SQLite database (inside the data volume in
 * Docker, so it survives restarts and sits alongside the nightly backups).
 * Reads DATABASE_URL directly rather than importing lib/prisma's getDbPath —
 * that module instantiates the Prisma client at import time, which this
 * module (imported first thing in instrumentation.ts, see startLogCapture)
 * has no reason to force this early.
 */
function getLogDir(): string {
  const dbPath = (process.env.DATABASE_URL ?? "file:./data/DutyRoster.db").replace(/^file:/, "");
  return join(dirname(dbPath), "logs");
}

export const LOG_DIR = getLogDir();
export const LOG_FILE = join(LOG_DIR, "app.log");

const globalForCapture = globalThis as unknown as { logCaptureStarted?: boolean };

type Chunk = string | Uint8Array;

/** Wraps `stream.write` so every call also reaches `sink`, in addition to whatever it already did. */
export function tee(
  stream: { write(...args: unknown[]): boolean },
  sink: { write(chunk: Chunk): unknown }
): void {
  const original = stream.write.bind(stream);
  stream.write = (...args: unknown[]) => {
    sink.write(args[0] as Chunk);
    return original(...args);
  };
}

/**
 * Tees `process.stdout`/`process.stderr` to `LOG_FILE`, in addition to
 * whatever already consumes them (the terminal, `docker logs`).
 *
 * Must run before anything constructs the shared pino logger (`lib/logger.ts`,
 * imported all over the app) — pino writes straight to file descriptor 1/2
 * via a `SonicBoom`, bypassing `process.stdout`/`stderr.write` entirely,
 * *unless* those methods have already been reassigned by the time pino is
 * built (pino's own `hasBeenTampered` check). So this module deliberately
 * has no dependency on lib/logger or anything that imports it — importing it
 * must not itself construct the logger — and instrumentation.ts calls
 * startLogCapture() as the very first thing in register(), before any
 * `@/lib/logger` import anywhere below it.
 *
 * A second consequence of patching the process streams rather than adding a
 * destination to pino itself: every line that would show up in `docker logs`
 * ends up in the file, not just what happens to go through the shared
 * logger — a node-cron error, an uncaught exception's stack trace, anything
 * printed with a bare `console.log`.
 */
export function startLogCapture(): void {
  if (globalForCapture.logCaptureStarted) return;
  mkdirSync(LOG_DIR, { recursive: true });
  const file = createWriteStream(LOG_FILE, { flags: "a" });
  let errorReported = false;
  file.on("error", (err) => {
    // Not routed through the logger: if the log file itself is the problem,
    // writing about it there is the last thing that should happen. And not
    // through `process.stderr` either — tee() feeds that straight back into
    // this same failing stream, so each report would emit another "error"
    // and the handler would recurse until the stack blows. `writeSync(2, …)`
    // goes to the raw file descriptor, past the patched `write`. Reported
    // once: a full disk fires "error" for every queued write, and thousands
    // of identical lines help nobody.
    if (errorReported) return;
    errorReported = true;
    try {
      writeSync(2, `[logs] failed to write to ${LOG_FILE}: ${err.message}\n`);
    } catch {
      // stderr itself is gone — nothing left to report to.
    }
  });
  tee(process.stdout, file);
  tee(process.stderr, file);
  globalForCapture.logCaptureStarted = true;
}
