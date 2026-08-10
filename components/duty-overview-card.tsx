import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateCH } from "@/lib/date";

export interface DutyWeekInfo {
  weekNumber: number;
  names: string[];
}

export function DutyOverviewCard({
  thisWeek,
  nextWeek,
  uncoveredWeekNumbers,
  uncoveredDates = [],
}: {
  thisWeek: DutyWeekInfo;
  nextWeek: DutyWeekInfo;
  uncoveredWeekNumbers: number[];
  /** Individual uncovered workdays (YYYY-MM-DD) within an otherwise-covered week. */
  uncoveredDates?: string[];
}) {
  const renderNames = (info: DutyWeekInfo) =>
    info.names.length > 0 ? (
      <span className="font-medium">{info.names.join(", ")}</span>
    ) : (
      <span className="font-medium text-destructive">niemand eingeteilt</span>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Dienstübersicht</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          Diese Woche (KW {thisWeek.weekNumber}): {renderNames(thisWeek)}
        </p>
        <p>
          Nächste Woche (KW {nextWeek.weekNumber}): {renderNames(nextWeek)}
        </p>
        <p className="pt-1 text-muted-foreground">
          Ungedeckte Wochen bis Jahresende:{" "}
          {uncoveredWeekNumbers.length > 0 ? (
            <span className="font-medium text-destructive">
              {uncoveredWeekNumbers.map((n) => `KW ${n}`).join(", ")}
            </span>
          ) : (
            "keine"
          )}
        </p>
        {uncoveredDates.length > 0 && (
          <p className="text-muted-foreground">
            Ungedeckte Tage bis Jahresende:{" "}
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {uncoveredDates.map(formatDateCH).join(", ")}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
