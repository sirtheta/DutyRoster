"use client";

import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { TYPE_INFO, ENTRY_TYPES } from "@/lib/entry-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DashboardChart({
  data,
  year,
}: {
  data: Record<string, string | number>[];
  year: number;
}) {
  const router = useRouter();

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
      <div className="h-[500px] w-full rounded-md border p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            {ENTRY_TYPES.map((type) => (
              <Bar key={type} dataKey={type} stackId="a" fill={TYPE_INFO[type].color} name={`${type} – ${TYPE_INFO[type].label}`} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
