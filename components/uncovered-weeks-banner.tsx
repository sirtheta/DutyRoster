import { Card, CardContent } from "@/components/ui/card";

export function UncoveredWeeksBanner({ weekNumbers }: { weekNumbers: number[] }) {
  if (weekNumbers.length === 0) return null;
  return (
    <Card className="border-destructive/50">
      <CardContent className="py-3 text-sm">
        <span className="font-medium text-destructive">Ungedeckte Wochen: </span>
        {weekNumbers.map((n) => `KW ${n}`).join(", ")} — für diese Wochen ist noch niemand für den
        Sanitäts-Dienst eingeteilt.
      </CardContent>
    </Card>
  );
}
