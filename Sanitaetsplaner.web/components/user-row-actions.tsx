"use client";

import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toggleActiveAction } from "@/app/(app)/users/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserFormDialog, type UserListItem } from "@/components/user-form-dialog";

export function UserRowActions({ user }: { user: UserListItem }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-1">
      <UserFormDialog
        mode="edit"
        user={user}
        trigger={
          <Button variant="ghost" size="sm">
            Bearbeiten
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={isPending}
            onClick={() => startTransition(() => toggleActiveAction(user.id, !user.isActive))}
          >
            {user.isActive ? "Deaktivieren" : "Aktivieren"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
