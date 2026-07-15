export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;
  const required = ["AUTH_SECRET", "ENCRYPTION_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  if ((process.env.AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
}
