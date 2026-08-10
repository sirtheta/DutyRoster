import { Card, CardContent } from "@/components/ui/card";
import { formatDateCH } from "@/lib/date";

export function UncoveredWeeksBanner({
  weekNumbers,
  partialDates = [],
}: {
  weekNumbers: number[];
  /** Individual uncovered workdays (YYYY-MM-DD) within an otherwise-covered week. */
  partialDates?: string[];
}) {
  if (weekNumbers.length === 0 && partialDates.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {weekNumbers.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-destructive">Ungedeckte Wochen: </span>
            {weekNumbers.map((n) => `KW ${n}`).join(", ")} — für diese Wochen ist noch niemand für den
            Sanitäts-Dienst eingeteilt.
          </CardContent>
        </Card>
      )}
      {partialDates.length > 0 && (
        <Card className="border-amber-500/50">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">Ungedeckte Tage: </span>
            {partialDates.map(formatDateCH).join(", ")} — an diesen Tagen ist trotz Dienst in der übrigen
            Woche niemand eingeteilt.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
