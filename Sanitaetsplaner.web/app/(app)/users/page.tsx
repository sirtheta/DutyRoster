import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserFormDialog } from "@/components/user-form-dialog";
import { UserRowActions } from "@/components/user-row-actions";
import { Button } from "@/components/ui/button";

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { rotationOrder: "asc" } });

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
