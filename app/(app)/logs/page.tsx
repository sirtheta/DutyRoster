import { requireAdmin } from "@/lib/permissions";
import { listLogFiles } from "@/lib/logs";
import { formatDateCH } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function LogsPage() {
  await requireAdmin();

  const files = listLogFiles();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Anwendungs-Logs zum Herunterladen — bisher nur über <code>docker logs</code> einsehbar.
          Die laufende Datei wird täglich abgeschnitten; ältere Tage bleiben so lange, wie die
          Aufbewahrungsfrist es erlaubt.
        </p>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Logdateien vorhanden.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Datei</TableHead>
              <TableHead>Grösse</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.name}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateCH(file.date)}
                </TableCell>
                <TableCell>
                  {file.name}
                  {file.current && (
                    <Badge variant="outline" className="ml-2">
                      Laufend
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatSize(file.sizeBytes)}</TableCell>
                <TableCell>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/logs/${encodeURIComponent(file.name)}`}>Herunterladen</a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
