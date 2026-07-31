import { readFileSync } from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { compare } from "bcryptjs";
import { config } from "@/lib/config";

const COMMON_PASSWORDS_PATH = path.join(process.cwd(), "lib", "data", "common-passwords-100k.txt.gz");

let commonPasswords: Set<string> | null = null;

/**
 * Loaded once per process and kept in memory — the gzipped source is ~370KB,
 * decompressing it on every password check would be wasteful for a list that
 * never changes at runtime.
 */
function loadCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const raw = gunzipSync(readFileSync(COMMON_PASSWORDS_PATH)).toString("utf-8");
    commonPasswords = new Set(raw.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean));
  }
  return commonPasswords;
}

/**
 * Top 100k passwords from real-world breaches (SecLists' xato-net list).
 * Case-insensitive, since attackers try the obvious case variants for free.
 */
export function isCommonPassword(password: string): boolean {
  return loadCommonPasswords().has(password.toLowerCase());
}

// A pre-hashed dummy value so `dummyCompare` spends the same amount of time
// as a real password check, even though the comparison always fails.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8I8p8vLKAxfsWWmM8XoAyxAOJgnbwe";

/** Runs a bcrypt compare against a fixed hash so response time doesn't leak whether a user exists. */
export async function dummyCompare(password: string): Promise<void> {
  await compare(password, DUMMY_HASH);
}

export const bcryptRounds = config.bcrypt.rounds;
