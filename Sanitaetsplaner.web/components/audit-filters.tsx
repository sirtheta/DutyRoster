"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const ALL = "all";

export function AuditFilters({
  entityTypes,
  actions,
  users,
}: {
  entityTypes: { value: string; label: string }[];
  actions: { value: string; label: string }[];
  users: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={searchParams.get("entityType") ?? ALL} onValueChange={(v) => setParam("entityType", v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Objekt" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Objekte</SelectItem>
          {entityTypes.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("action") ?? ALL} onValueChange={(v) => setParam("action", v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Aktion" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Aktionen</SelectItem>
          {actions.map((a) => (
            <SelectItem key={a.value} value={a.value}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("userId") ?? ALL} onValueChange={(v) => setParam("userId", v)}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Benutzer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Benutzer</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
