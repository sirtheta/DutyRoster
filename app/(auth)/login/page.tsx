"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AppFooter } from "@/components/app-footer";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // "Went back" overrides a 2FA-required result from a previous submission;
  // reset on the next submit so a re-attempt can show the code step again.
  const [wentBack, setWentBack] = useState(false);
  const twoFactorStep = !wentBack && !!state?.twoFactorRequired;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Sanitätsplaner</CardTitle>
            <CardDescription>
              {twoFactorStep
                ? "Gib deinen Bestätigungscode ein."
                : "Melde dich mit deinem Konto an."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={formAction}
              onSubmit={() => setWentBack(false)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  readOnly={twoFactorStep}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={twoFactorStep ? "bg-muted" : undefined}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Passwort</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  readOnly={twoFactorStep}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={twoFactorStep ? "bg-muted" : undefined}
                />
              </div>
              {twoFactorStep && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">Bestätigungscode</Label>
                  <Input
                    id="code"
                    name="code"
                    autoComplete="one-time-code"
                    placeholder="6-stelliger Code oder Backup-Code"
                    autoFocus
                    required
                  />
                </div>
              )}
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" disabled={pending} className="mt-2">
                {pending ? "Anmelden…" : twoFactorStep ? "Bestätigen" : "Anmelden"}
              </Button>
              {twoFactorStep ? (
                <button
                  type="button"
                  onClick={() => setWentBack(true)}
                  className="text-center text-sm text-muted-foreground hover:underline"
                >
                  Andere Anmeldedaten verwenden
                </button>
              ) : (
                <Link
                  href="/forgot-password"
                  className="text-center text-sm text-muted-foreground hover:underline"
                >
                  Passwort vergessen?
                </Link>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
      <AppFooter />
    </div>
  );
}
