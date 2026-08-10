import { NextResponse, type NextRequest } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { resolveLogFilePath } from "@/lib/logs";

/**
 * Streams one application log file for download. Admin-only: logs can
 * contain request metadata (IPs, stack traces, iCal token lookups) about
 * every user, not just the exporting admin's own data.
 *
 * An API route rather than a Server Action because the response is a file
 * stream, not a mutation — same reasoning as the plan .xlsx export.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  if (session.user.role !== "Admin") {
    return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });
  }

  const { filename } = await params;
  // resolveLogFilePath only accepts "app.log" or the exact app-YYYY-MM-DD.log
  // shape, so a filename like "../../.env" never resolves to a path outside
  // the log directory.
  const path = resolveLogFilePath(filename);
  if (!path || !existsSync(path)) {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }

  const size = statSync(path).size;
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
