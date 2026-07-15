"use client";

import { useRouter } from "next/navigation";
import { EntryType } from "@prisma/client";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
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

  const totals = ENTRY_TYPES.reduce<Record<EntryType, number>>((acc, type) => {
    acc[type] = data.reduce((sum, row) => sum + (row[type] as number), 0);
    return acc;
  }, {} as Record<EntryType, number>);

  const rows = data
    .map((row) => ({
      name: row.name as string,
      total: ENTRY_TYPES.reduce((sum, type) => sum + (row[type] as number), 0),
      row,
    }))
    .sort((a, b) => b.total - a.total);

  const maxRowTotal = Math.max(1, ...rows.map((r) => r.total));

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ENTRY_TYPES.map((type) => (
          <Card key={type}>
            <CardContent className="flex items-center gap-3 p-4">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: TYPE_INFO[type].color }}
              />
              <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight">{totals[type]}</div>
                <div className="truncate text-xs text-muted-foreground">{TYPE_INFO[type].label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Übersicht pro Mitarbeiter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {rows.map(({ name, total, row }) => (
            <div key={name} className="flex items-center gap-3">
              <div className="w-32 shrink-0 truncate text-sm" title={name}>
                {name}
              </div>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="flex h-full"
                  style={{ width: `${(total / maxRowTotal) * 100}%` }}
                >
                  {ENTRY_TYPES.map((type) => {
                    const value = row[type] as number;
                    if (!value) return null;
                    return (
                      <div
                        key={type}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{
                          width: `${(value / total) * 100}%`,
                          backgroundColor: TYPE_INFO[type].color,
                        }}
                        title={`${TYPE_INFO[type].label}: ${value}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="w-8 shrink-0 text-right text-sm text-muted-foreground">{total}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {ENTRY_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_INFO[type].color }}
            />
            {type} – {TYPE_INFO[type].label}
          </div>
        ))}
      </div>
    </div>
  );
}
