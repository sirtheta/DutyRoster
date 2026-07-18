import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { formatDateCH } from "@/lib/date";
import { rosterForYearWhere } from "@/lib/users";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserFormDialog } from "@/components/user-form-dialog";
import { UserRowActions } from "@/components/user-row-actions";
import { Button } from "@/components/ui/button";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  await requireAdmin();
  const { all } = await searchParams;
  const showAll = all === "1";
  // Explicit select: the rows are passed to client components and serialized
  // to the browser — passwordHash/icalToken must never be part of that payload.
  const users = await prisma.user.findMany({
    // Ex-colleagues stay visible through the end of the year they left in
    // (same cutoff as the calendar/dashboard/export), then drop out of the
    // default view once a new year starts — "all" opts back in, e.g. to
    // reactivate someone rehired later or to look up an old exit date.
    where: showAll ? undefined : rosterForYearWhere(new Date().getFullYear()),
    orderBy: { rotationOrder: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      exitDate: true,
      rotationOrder: true,
      notifyEnabled: true,
      notifyEmail: true,
      notifyTelegram: true,
      notifyWeekday: true,
      notifyHour: true,
      telegramChatId: true,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Benutzer</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={showAll ? "/users" : "/users?all=1"}>
              {showAll ? "Nur aktuelle anzeigen" : "Ehemalige anzeigen"}
            </Link>
          </Button>
          <UserFormDialog mode="create" trigger={<Button size="sm">Neuer Benutzer</Button>} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reihenfolge</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Benachrichtigung</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.rotationOrder}</TableCell>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{u.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? "default" : "outline"}>
                  {u.isActive ? "Aktiv" : "Inaktiv"}
                </Badge>
                {u.exitDate && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Austritt: {formatDateCH(u.exitDate)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {u.notifyEnabled
                  ? `${[u.notifyEmail && "E-Mail", u.notifyTelegram && "Telegram"].filter(Boolean).join(", ")} · Wochentag ${u.notifyWeekday}, ${u.notifyHour}:00`
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <UserRowActions user={u} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
