"use client";

import { useActionState, useState } from "react";
import { terminateUserAction } from "@/app/(app)/users/actions";
import { toDateString } from "@/lib/date";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserListItem } from "@/components/user-form-dialog";

export function UserTerminateDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [regenerate, setRegenerate] = useState(false);
  const [state, formAction, pending] = useActionState(terminateUserAction, undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Austritt erfassen: {user.name}</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            await formAction(formData);
            onOpenChange(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={user.id} />
          <p className="text-sm text-muted-foreground">
            Der Benutzer wird deaktiviert. Einträge bis und mit Austrittsdatum bleiben erhalten, alle
            danach liegenden Dienste und Absenzen werden entfernt.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="exitDate">Austrittsdatum</Label>
            <Input
              id="exitDate"
              name="exitDate"
              type="date"
              defaultValue={user.exitDate ?? toDateString(new Date())}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="regenerateRotation"
              name="regenerateRotation"
              type="checkbox"
              checked={regenerate}
              onChange={(e) => setRegenerate(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="regenerateRotation">
              Rotation für betroffene Jahre danach neu generieren
            </Label>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Wird bearbeitet…" : "Austritt bestätigen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
