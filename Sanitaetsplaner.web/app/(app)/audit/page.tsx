import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuditFilters } from "@/components/audit-filters";
import { actionLabel, entityLabel, describeAuditLog } from "@/lib/audit-format";
import type { AuditAction, AuditEntity } from "@/lib/audit";

const PAGE_SIZE = 50;

const ENTITY_TYPES: AuditEntity[] = ["Entry", "Holiday", "User", "Settings"];
const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "MOVE", "AUTOMATIC", "SETTINGS"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; action?: string; userId?: string; page?: string }>;
}) {
  await requireAdmin();
  const { entityType, action, userId, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(userId ? { userId: parseInt(userId, 10) } : {}),
  };

  const [logs, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const userNames = new Map(users.map((u) => [u.id, u.name]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (userId) params.set("userId", userId);
    params.set("page", String(p));
    return `/audit?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl">Audit-Log</h1>

      <AuditFilters
        entityTypes={ENTITY_TYPES.map((e) => ({ value: e, label: entityLabel(e) }))}
        actions={ACTIONS.map((a) => ({ value: a, label: actionLabel(a) }))}
        users={users}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zeitpunkt</TableHead>
            <TableHead>Benutzer</TableHead>
            <TableHead>Aktion</TableHead>
            <TableHead>Objekt</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {log.createdAt.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "medium" })}
              </TableCell>
              <TableCell className="font-medium">{log.userName}</TableCell>
              <TableCell>
                <Badge variant="secondary">{actionLabel(log.action)}</Badge>
              </TableCell>
              <TableCell>{entityLabel(log.entityType)}</TableCell>
              <TableCell className="max-w-xl">{describeAuditLog(log, userNames)}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                Keine Einträge gefunden.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Seite {page} von {totalPages} ({total} Einträge)
          </span>
          <div className="flex gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Zurück
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>Zurück</Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Weiter
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Weiter</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
