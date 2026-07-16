"use client";

import { useState } from "react";
import { Bell, KeyRound, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Benutzermenü">
            <UserIcon className="h-4 w-4" />
          </Button>
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
        open={notificationDialogOpen}
        onOpenChange={setNotificationDialogOpen}
        settings={notificationSettings}
      />
    </>
  );
}
