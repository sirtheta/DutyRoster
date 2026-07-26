"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  startTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
} from "@/app/(app)/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

type Step = "status" | "setup" | "backupCodes" | "disable" | "regenerate";

function downloadBackupCodes(codes: string[]) {
  const blob = new Blob(
    [
      "Sanitätsplaner – Backup-Codes für die Zwei-Faktor-Authentifizierung\n",
      "Jeder Code funktioniert einmalig, falls kein Zugriff auf die Authenticator-App besteht.\n\n",
      codes.join("\n"),
      "\n",
    ],
    { type: "text/plain" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sanitaetsplaner-backup-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Local step/enabled state is only initialized on mount, so the caller must
 * remount this component (e.g. `key={open}`) each time it's opened — same
 * convention as NotificationSettingsDialog.
 */
export function TwoFactorSettingsDialog({
  open,
  onOpenChange,
  enabled: initialEnabled,
  onEnabledChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("status");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  function beginSetup() {
    setError(undefined);
    startTransition(async () => {
      const res = await startTwoFactorSetupAction();
      if (res.error) {
        setError(res.error);
        return;
      }
      setQrDataUrl(res.qrDataUrl ?? null);
      setSecret(res.secret ?? null);
      setStep("setup");
    });
  }

  function confirmSetup(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const res = await confirmTwoFactorSetupAction(undefined, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.backupCodes) {
        setEnabled(true);
        onEnabledChange(true);
        setBackupCodes(res.backupCodes);
        setStep("backupCodes");
        toast.success("Zwei-Faktor-Authentifizierung aktiviert.");
      }
    });
  }

  function disable(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const res = await disableTwoFactorAction(undefined, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEnabled(false);
      onEnabledChange(false);
      setStep("status");
      toast.success("Zwei-Faktor-Authentifizierung deaktiviert.");
    });
  }

  function regenerate(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const res = await regenerateBackupCodesAction(undefined, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.backupCodes) {
        setBackupCodes(res.backupCodes);
        setStep("backupCodes");
        toast.success("Neue Backup-Codes erstellt.");
      }
    });
  }

  function goToStatus() {
    setError(undefined);
    setStep("status");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zwei-Faktor-Authentifizierung</DialogTitle>
          {step === "status" && (
            <DialogDescription>
              {enabled
                ? "Aktiv — beim Anmelden wird zusätzlich ein Code aus deiner Authenticator-App verlangt."
                : "Schützt dein Konto mit einem zusätzlichen Code aus einer Authenticator-App (z. B. Google Authenticator, Authy) beim Anmelden."}
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "status" && (
          <>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-start">
              {enabled ? (
                <>
                  <Button variant="outline" onClick={() => setStep("regenerate")}>
                    Backup-Codes neu erstellen
                  </Button>
                  <Button variant="destructive" onClick={() => setStep("disable")}>
                    Deaktivieren
                  </Button>
                </>
              ) : (
                <Button onClick={beginSetup} disabled={pending}>
                  {pending ? "Wird vorbereitet…" : "Aktivieren"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "setup" && qrDataUrl && (
          <form action={confirmSetup} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              QR-Code mit der Authenticator-App scannen oder den Code manuell eintragen, dann den
              6-stelligen Bestätigungscode eingeben.
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR-Code für die Authenticator-App" className="h-48 w-48" />
            </div>
            {secret && (
              <div className="flex flex-col gap-1">
                <Label>Manueller Code</Label>
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">{secret}</code>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Bestätigungscode</Label>
              <Input id="code" name="code" autoFocus required autoComplete="one-time-code" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={goToStatus}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Wird geprüft…" : "Bestätigen"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "backupCodes" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Diese Backup-Codes werden nur einmal angezeigt. Jeder Code funktioniert einmalig als
              Ersatz für den Authenticator-Code, falls kein Zugriff auf die App besteht — an einem
              sicheren Ort aufbewahren.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-sm">
              {backupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => downloadBackupCodes(backupCodes)}>
                Herunterladen
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setBackupCodes([]);
                  setStep("status");
                }}
              >
                Fertig
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "disable" && (
          <form action={disable} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Zum Deaktivieren das aktuelle Passwort bestätigen.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="disablePassword">Passwort</Label>
              <PasswordInput
                id="disablePassword"
                name="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={goToStatus}>
                Abbrechen
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Wird deaktiviert…" : "Deaktivieren"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "regenerate" && (
          <form action={regenerate} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Alle bisherigen Backup-Codes werden ungültig. Zum Bestätigen das aktuelle Passwort
              eingeben.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="regeneratePassword">Passwort</Label>
              <PasswordInput
                id="regeneratePassword"
                name="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={goToStatus}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Wird erstellt…" : "Neu erstellen"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
