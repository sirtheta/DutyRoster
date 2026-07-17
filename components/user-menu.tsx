"use client";

import { useState } from "react";
import { Bell, KeyRound, LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  NotificationSettingsDialog,
  type OwnNotificationSettings,
} from "@/components/notification-settings-dialog";
import { signOutAction } from "@/app/(app)/actions";

export function UserMenu({
  name,
  email,
  notificationSettings,
}: {
  name: string;
  email: string;
  notificationSettings: OwnNotificationSettings;
}) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
            aria-label="Benutzermenü"
          >
            {initials || <UserIcon className="size-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNotificationDialogOpen(true)}>
            <Bell className="mr-2 inline h-4 w-4" /> Benachrichtigungen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordDialogOpen(true)}>
            <KeyRound className="mr-2 inline h-4 w-4" /> Passwort ändern
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOutAction()}>
            <LogOut className="mr-2 inline h-4 w-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
      <NotificationSettingsDialog
        key={notificationDialogOpen ? "open" : "closed"}
        open={notificationDialogOpen}
        onOpenChange={setNotificationDialogOpen}
        settings={notificationSettings}
      />
    </>
  );
}
