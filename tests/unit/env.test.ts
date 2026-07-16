import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "@/lib/env";

describe("validateEnv", () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = original.NODE_ENV;
    process.env.AUTH_SECRET = original.AUTH_SECRET;
    process.env.ENCRYPTION_KEY = original.ENCRYPTION_KEY;
  });

  it("does nothing outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_SECRET;
    delete process.env.ENCRYPTION_KEY;
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when required variables are missing in production", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.ENCRYPTION_KEY;
    expect(() => validateEnv()).toThrow(/Missing required environment variables/);
  });

  it("throws when a required variable is a known placeholder", () => {
    process.env.AUTH_SECRET = "INSECURE-DEFAULT-please-change-me-now";
    process.env.ENCRYPTION_KEY = "a".repeat(32);
    expect(() => validateEnv()).toThrow(/publicly known placeholder/);
  });

  it("throws when AUTH_SECRET is too short", () => {
    process.env.AUTH_SECRET = "short";
    process.env.ENCRYPTION_KEY = "a".repeat(32);
    expect(() => validateEnv()).toThrow(/AUTH_SECRET must be at least 32 characters/);
  });

  it("throws when ENCRYPTION_KEY is too short", () => {
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.ENCRYPTION_KEY = "short";
    expect(() => validateEnv()).toThrow(/ENCRYPTION_KEY must be at least 32 characters/);
  });

  it("passes with valid, non-placeholder secrets", () => {
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.ENCRYPTION_KEY = "b".repeat(32);
    expect(() => validateEnv()).not.toThrow();
  });
});
