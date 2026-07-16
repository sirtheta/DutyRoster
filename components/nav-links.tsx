"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

export const LINKS: { href: string; label: string; roles: UserRole[] }[] = [
  { href: "/calendar", label: "Kalender", roles: ["Admin", "Editor", "Viewer"] },
  { href: "/dashboard", label: "Dashboard", roles: ["Admin", "Editor", "Viewer"] },
  { href: "/holidays", label: "Feiertage", roles: ["Admin", "Editor", "Viewer"] },
  { href: "/users", label: "Benutzer", roles: ["Admin"] },
  { href: "/settings", label: "Einstellungen", roles: ["Admin"] },
  { href: "/audit", label: "Audit-Log", roles: ["Admin"] },
];

export function NavLinks({
  role,
  vertical = false,
  onNavigate,
}: {
  role: UserRole;
  vertical?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex items-center gap-1", vertical && "flex-col items-stretch gap-1")}>
      {LINKS.filter((l) => l.roles.includes(role)).map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
            vertical && "w-full",
            pathname.startsWith(link.href) && "bg-accent text-accent-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
