"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { User } from "@prisma/client";
import { createUserAction, updateUserAction } from "@/app/(app)/users/actions";

/**
 * The subset of `User` the admin UI needs. Deliberately excludes
 * `passwordHash` and `icalToken`: props of client components are serialized
 * into the page payload, so secrets must never appear here.
 */
export type UserListItem = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "role"
  | "isActive"
  | "exitDate"
  | "rotationOrder"
  | "notifyEnabled"
  | "notifyChannel"
  | "notifyWeekday"
  | "notifyHour"
  | "telegramChatId"
>;
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function UserFormDialog({
  mode,
  user,
  trigger,
}: {
  mode: "create" | "edit";
  user?: UserListItem;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(user?.notifyEnabled ?? false);
  const action = mode === "create" ? createUserAction : updateUserAction;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !state?.error) {
          // dialog closed after a successful submit; nothing else to do,
          // the server action already revalidated the list.
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Neuer Benutzer" : `Benutzer bearbeiten: ${user?.name}`}</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            await formAction(formData);
            setOpen(false);
          }}
          className="grid grid-cols-2 gap-4"
        >
          {mode === "edit" && <input type="hidden" name="id" value={user?.id} />}
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={user?.name} required />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" name="email" type="email" defaultValue={user?.email} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              Passwort {mode === "edit" && <span className="text-muted-foreground">(leer lassen = unverändert)</span>}
            </Label>
            <PasswordInput id="password" name="password" minLength={8} required={mode === "create"} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rotationOrder">Rotations-Reihenfolge</Label>
            <Input
              id="rotationOrder"
              name="rotationOrder"
              type="number"
              min={0}
              defaultValue={user?.rotationOrder ?? 0}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Rolle</Label>
            <select
              id="role"
              name="role"
              defaultValue={user?.role ?? "Viewer"}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="notifyEnabled"
              name="notifyEnabled"
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="notifyEnabled">Benachrichtigung aktiv</Label>
          </div>
          <div className={notifyEnabled ? "contents" : "hidden"}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notifyChannel">Kanal</Label>
                <select
                  id="notifyChannel"
                  name="notifyChannel"
                  defaultValue={user?.notifyChannel ?? "Email"}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="Email">E-Mail</option>
                  <option value="Telegram">Telegram</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notifyWeekday">Wochentag</Label>
                <select
                  id="notifyWeekday"
                  name="notifyWeekday"
                  defaultValue={user?.notifyWeekday ?? 1}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {WEEKDAYS.map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notifyHour">Uhrzeit (Stunde, 24h)</Label>
                <Input
                  id="notifyHour"
                  name="notifyHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={user?.notifyHour ?? 7}
                />
                <span className="text-xs text-muted-foreground">
                  z. B. 7 = 07:00 Uhr, lokale Zeit (Europe/Zurich)
                </span>
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <Label htmlFor="telegramChatId">Telegram Chat-ID</Label>
                <Input id="telegramChatId" name="telegramChatId" defaultValue={user?.telegramChatId ?? ""} />
              </div>
          </div>
          {state?.error && <p className="col-span-2 text-sm text-destructive">{state.error}</p>}
          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
