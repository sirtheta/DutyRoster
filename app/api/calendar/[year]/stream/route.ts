import { NextRequest } from "next/server";
import { requireSession } from "@/lib/permissions";
import { calendarEvents } from "@/lib/calendar-events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  await requireSession();
  const { year } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const onChange = (changedYear: string) => {
        if (changedYear === year) controller.enqueue(encoder.encode("data: change\n\n"));
      };
      calendarEvents.on("change", onChange);

      // Comment lines double as a keep-alive so idle proxies/load balancers
      // don't time out the connection; EventSource ignores them.
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        calendarEvents.off("change", onChange);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
