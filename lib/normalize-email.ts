import { z } from "zod";

/**
 * Email addresses are matched case-insensitively everywhere (login,
 * password reset, uniqueness) since RFC 5321 treats the domain part as
 * case-insensitive and virtually no real-world mailbox provider treats the
 * local part as case-sensitive either. Trimming + lowercasing at the one
 * place addresses enter the system (this schema) keeps every stored value
 * and every lookup in the same canonical form, so `User.email`'s `@unique`
 * constraint and exact-match lookups behave case-insensitively without
 * needing `COLLATE NOCASE`/`mode: "insensitive"` support.
 */
export const emailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email());
