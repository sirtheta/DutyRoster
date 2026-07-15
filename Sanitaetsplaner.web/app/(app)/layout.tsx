import { requireSession } from "@/lib/permissions";
import { NavLinks } from "@/components/nav-links";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Sanitätsplaner</span>
          <NavLinks role={session.user.role} />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu name={session.user.name ?? ""} email={session.user.email ?? ""} />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
