"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import logger from "@/lib/logger";

const log = logger.child({ module: "login" });

export type LoginState = {
  error?: string;
  // Password was correct but the account has 2FA enabled: the form should
  // show the code field and resubmit with it instead of showing an error.
  twoFactorRequired?: boolean;
};

export async function loginAction(
  _prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      code: formData.get("code") || undefined,
      redirectTo: "/calendar",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code;
      if (code === "two_factor_required") return { twoFactorRequired: true };
      if (code === "two_factor_invalid") {
        return { twoFactorRequired: true, error: "Ungültiger Code." };
      }
      return { error: "E-Mail oder Passwort ist falsch." };
    }
    // A successful signIn() throws Next.js's internal NEXT_REDIRECT control-flow
    // error (digest-tagged) to perform the redirect — not a real failure.
    const isRedirect = err instanceof Error && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
    if (!isRedirect) log.error({ err }, "Unexpected error during login");
    throw err;
  }
}
