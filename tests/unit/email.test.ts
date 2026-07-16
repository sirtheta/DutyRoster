import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SystemSettings } from "@prisma/client";

const mockSendMail = vi.fn().mockResolvedValue({});
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
}));

function settings(overrides: Partial<SystemSettings> = {}): SystemSettings {
  return {
    id: 1,
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpUser: "user@example.com",
    smtpPassword: "plaintext-password",
    smtpFromName: null,
    telegramBotToken: null,
    ...overrides,
  } as SystemSettings;
}

describe("sendPlanEmail", () => {
  const originalDisable = process.env.DISABLE_EMAIL;

  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    delete process.env.DISABLE_EMAIL;
  });

  afterEach(() => {
    process.env.DISABLE_EMAIL = originalDisable;
  });

  it("throws when SMTP is not configured", async () => {
    const { sendPlanEmail } = await import("@/lib/email");
    await expect(sendPlanEmail(settings({ smtpHost: null }), "to@example.com", "Subj", "Body")).rejects.toThrow(
      "SMTP nicht konfiguriert"
    );
  });

  it("sends mail using smtpUser as the from-name fallback", async () => {
    const { sendPlanEmail } = await import("@/lib/email");
    await sendPlanEmail(settings(), "to@example.com", "Subj", "Body");

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"user@example.com" <user@example.com>',
        to: "to@example.com",
        subject: "Subj",
        text: "Body",
      })
    );
  });

  it("uses the configured smtpFromName when set", async () => {
    const { sendPlanEmail } = await import("@/lib/email");
    await sendPlanEmail(settings({ smtpFromName: "Sanitätsplaner" }), "to@example.com", "Subj", "Body");

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Sanitätsplaner" <user@example.com>' }));
  });

  it("marks the connection secure for port 465", async () => {
    const { sendPlanEmail } = await import("@/lib/email");
    await sendPlanEmail(settings({ smtpPort: 465 }), "to@example.com", "Subj", "Body");

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, port: 465 }));
  });

  it("skips sending when DISABLE_EMAIL=true", async () => {
    process.env.DISABLE_EMAIL = "true";
    const { sendPlanEmail } = await import("@/lib/email");
    await sendPlanEmail(settings(), "to@example.com", "Subj", "Body");

    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
