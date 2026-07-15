import { createEvents, type EventAttributes } from "ics";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addDays } from "@/lib/date";
import { TYPE_INFO } from "@/lib/entry-types";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await prisma.user.findUnique({ where: { icalToken: token } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const entries = await prisma.entry.findMany({
    where: { userId: user.id, type: { in: ["F", "S"] } },
    orderBy: { date: "asc" },
  });

  const events: EventAttributes[] = entries.map((e) => {
    const [y, m, d] = e.date.split("-").map(Number);
    const [ey, em, ed] = addDays(e.date, 1).split("-").map(Number);
    return {
      uid: `entry-${e.id}@sanitaetsplaner`,
      title: `${e.type} – ${TYPE_INFO[e.type].label}`,
      start: [y, m, d],
      end: [ey, em, ed],
      startInputType: "local",
      productId: "sanitaetsplaner/ics",
    };
  });

  const { error, value } = createEvents(events);
  if (error || !value) {
    return NextResponse.json({ error: "Kalender konnte nicht erstellt werden" }, { status: 500 });
  }

  return new NextResponse(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="sanitaetsplaner-${user.name}.ics"`,
      "Cache-Control": "private, max-age=1800",
    },
  });
}
