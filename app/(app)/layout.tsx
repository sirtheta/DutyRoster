import { requireSession } from "@/lib/permissions";
import { NavLinks } from "@/components/nav-links";
import { MobileNav } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppFooter } from "@/components/app-footer";
import prisma from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const ownUser = await prisma.user.findUniqueOrThrow({
    where: { id: parseInt(session.user.id, 10) },
    select: { notifyEnabled: true, notifyChannel: true, notifyWeekday: true, notifyHour: true, telegramChatId: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 md:gap-6">
          <MobileNav role={session.user.role} />
          <span className="font-semibold">Sanitätsplaner</span>
          <div className="hidden md:block">
            <NavLinks role={session.user.role} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu
            name={session.user.name ?? ""}
            email={session.user.email ?? ""}
            notificationSettings={ownUser}
          />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <AppFooter />
    </div>
  );
}
