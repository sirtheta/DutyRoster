"use client";

import { useRouter } from "next/navigation";
import { TYPE_INFO } from "@/lib/entry-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardChart({
  data,
  year,
}: {
  data: Record<string, string | number>[];
  year: number;
}) {
  const router = useRouter();

  const rows = data
    .map((row) => ({
      name: row.name as string,
      sCount: (row.S as number) || 0,
    }))
    .sort((a, b) => b.sCount - a.sCount);

  const maxSCount = Math.max(1, ...rows.map((r) => r.sCount));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="year">Jahr</Label>
        <Input
          id="year"
          type="number"
          defaultValue={year}
          className="w-28"
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push(`/dashboard?year=${e.currentTarget.value}`);
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Übersicht pro Mitarbeiter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rows.map(({ name, sCount }) => (
            <div key={name} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-sm" title={name}>
                {name}
              </div>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(sCount / maxSCount) * 100}%`,
                    backgroundColor: TYPE_INFO.S.color,
                  }}
                  title={`${TYPE_INFO.S.label}: ${sCount}`}
                />
              </div>
              <div className="w-8 shrink-0 text-right text-sm text-muted-foreground" title="S-Dienste">
                {sCount}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
