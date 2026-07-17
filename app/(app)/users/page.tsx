import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { formatDateCH } from "@/lib/date";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserFormDialog } from "@/components/user-form-dialog";
import { UserRowActions } from "@/components/user-row-actions";
import { Button } from "@/components/ui/button";

export default async function UsersPage() {
  await requireAdmin();
  // Explicit select: the rows are passed to client components and serialized
  // to the browser — passwordHash/icalToken must never be part of that payload.
  const users = await prisma.user.findMany({
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
      notifyChannel: true,
      notifyWeekday: true,
      notifyHour: true,
      telegramChatId: true,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Benutzer</h1>
        <UserFormDialog mode="create" trigger={<Button size="sm">Neuer Benutzer</Button>} />
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
                {u.notifyEnabled ? `${u.notifyChannel} · Wochentag ${u.notifyWeekday}, ${u.notifyHour}:00` : "—"}
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
