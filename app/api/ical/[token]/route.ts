import { createEvents, type EventAttributes } from "ics";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addDays } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";
import { isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";

// Throttles token guessing: only FAILED lookups count against the limit, so
// legitimate calendar clients polling a valid token are never rate-limited.
const ICAL_LIMIT = { maxAttempts: 10, windowMs: 15 * 60 * 1000 };

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateKey = `ical:${ip}`;
  if (isRateLimited(rateKey, ICAL_LIMIT)) {
    return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { icalToken: token } });
  if (!user || !user.isActive) {
    recordFailedAttempt(rateKey, ICAL_LIMIT);
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const entries = await prisma.entry.findMany({
    where: {
      userId: user.id,
      type: { in: user.icalIncludeVacation ? ["F", "S"] : ["S"] },
    },
    orderBy: { date: "asc" },
  });

  const events: EventAttributes[] = entries.map((e) => {
    const [y, m, d] = e.date.split("-").map(Number);
    const [ey, em, ed] = addDays(e.date, 1).split("-").map(Number);
    return {
      uid: `entry-${e.id}@DutyRoster`,
      title: `${e.type} – ${TYPE_INFO[e.type].label}`,
      start: [y, m, d],
      end: [ey, em, ed],
      startInputType: "local",
      productId: "DutyRoster/ics",
    };
  });

  const { error, value } = createEvents(events);
  if (error || !value) {
    return NextResponse.json({ error: "Kalender konnte nicht erstellt werden" }, { status: 500 });
  }

  return new NextResponse(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="DutyRoster-${user.name}.ics"`,
      "Cache-Control": "private, max-age=1800",
    },
  });
}
