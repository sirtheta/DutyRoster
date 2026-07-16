import { describe, it, expect } from "vitest";
import type { AuditLog } from "@prisma/client";
import { actionLabel, entityLabel, describeAuditLog } from "@/lib/audit-format";

function log(overrides: Partial<AuditLog>): AuditLog {
  return {
    id: 1,
    userId: 1,
    userName: "Test",
    action: "CREATE",
    entityType: "Entry",
    entityId: null,
    details: null,
    createdAt: new Date("2026-01-01"),
    ...overrides,
  } as AuditLog;
}

const userNames = new Map([[1, "Alice"], [2, "Bob"]]);

describe("actionLabel / entityLabel", () => {
  it("maps known actions and entities to German labels", () => {
    expect(actionLabel("CREATE")).toBe("Erstellt");
    expect(actionLabel("DELETE")).toBe("Gelöscht");
    expect(entityLabel("Entry")).toBe("Eintrag");
    expect(entityLabel("Holiday")).toBe("Feiertag");
  });

  it("falls back to the raw value for unknown actions/entities", () => {
    expect(actionLabel("WEIRD")).toBe("WEIRD");
    expect(entityLabel("Unknown")).toBe("Unknown");
  });
});

describe("describeAuditLog", () => {
  it("returns the raw details string when JSON parsing fails", () => {
    expect(describeAuditLog(log({ details: "not json" }), userNames)).toBe("not json");
  });

  it("returns '—' for an empty/null details payload", () => {
    expect(describeAuditLog(log({ entityType: "Settings", action: "UPDATE", details: null }), userNames)).toBe("—");
  });

  it("describes a single Entry MOVE", () => {
    const l = log({
      action: "MOVE",
      details: JSON.stringify({ from: { userId: 1, date: "2026-05-04" }, to: { userId: 1, date: "2026-05-05" } }),
    });
    expect(describeAuditLog(l, userNames)).toBe("Alice (04.05.2026) → Alice (05.05.2026)");
  });

  it("describes a bulk Entry MOVE", () => {
    const l = log({
      action: "MOVE",
      details: JSON.stringify({
        bulk: true,
        moves: [
          { fromUserId: 1, fromDate: "2026-05-04", toUserId: 2, toDate: "2026-05-11" },
          { fromUserId: 2, fromDate: "2026-05-05", toUserId: 1, toDate: "2026-05-12" },
        ],
      }),
    });
    expect(describeAuditLog(l, userNames)).toBe(
      "Alice (04.05.2026) → Bob (11.05.2026); Bob (05.05.2026) → Alice (12.05.2026)"
    );
  });

  it("falls back to '—' for a MOVE with neither from/to nor bulk moves", () => {
    const l = log({ action: "MOVE", details: JSON.stringify({}) });
    expect(describeAuditLog(l, userNames)).toBe("—");
  });

  it("describes a bulk Entry CREATE", () => {
    const l = log({ action: "CREATE", details: JSON.stringify({ bulk: true, count: 3, type: "S" }) });
    expect(describeAuditLog(l, userNames)).toBe("3 Einträge → Sanität (Dienst)");
  });

  it("describes a single Entry CREATE with an unknown user id", () => {
    const l = log({
      action: "CREATE",
      details: JSON.stringify({ userId: 99, date: "2026-05-04", before: null, after: "F" }),
    });
    expect(describeAuditLog(l, userNames)).toBe("#99, 04.05.2026: — → Ferien");
  });

  it("describes an Entry UPDATE with before and after types", () => {
    const l = log({
      action: "UPDATE",
      details: JSON.stringify({ userId: 1, date: "2026-05-04", before: "F", after: "S" }),
    });
    expect(describeAuditLog(l, userNames)).toBe("Alice, 04.05.2026: Ferien → Sanität (Dienst)");
  });

  it("describes an Entry DELETE", () => {
    const l = log({ action: "DELETE", details: JSON.stringify({ userId: 1, date: "2026-05-04", before: "S" }) });
    expect(describeAuditLog(l, userNames)).toBe("Alice, 04.05.2026: Sanität (Dienst) entfernt");
  });

  it("describes an Entry AUTOMATIC generation", () => {
    const l = log({ action: "AUTOMATIC", details: JSON.stringify({ year: 2026, count: 42 }) });
    expect(describeAuditLog(l, userNames)).toBe("Jahr 2026: 42 Dienste generiert");
  });

  it("describes a User email change", () => {
    const l = log({ entityType: "User", details: JSON.stringify({ email: "new@example.com" }) });
    expect(describeAuditLog(l, userNames)).toBe("E-Mail: new@example.com");
  });

  it("describes a User activation/deactivation", () => {
    expect(describeAuditLog(log({ entityType: "User", details: JSON.stringify({ isActive: true }) }), userNames)).toBe(
      "Aktiviert"
    );
    expect(
      describeAuditLog(log({ entityType: "User", details: JSON.stringify({ isActive: false }) }), userNames)
    ).toBe("Deaktiviert");
  });

  it("describes a Holiday range import", () => {
    const l = log({
      entityType: "Holiday",
      details: JSON.stringify({ from: "2026-07-01", to: "2026-07-10", name: "Betriebsferien", count: 10 }),
    });
    expect(describeAuditLog(l, userNames)).toBe("Betriebsferien (2026-07-01 – 2026-07-10, 10×)");
  });

  it("describes a Holiday year import", () => {
    const l = log({ entityType: "Holiday", details: JSON.stringify({ year: 2026, canton: "BE", count: 15 }) });
    expect(describeAuditLog(l, userNames)).toBe("2026 (BE), 15×");
  });

  it("describes a single Holiday", () => {
    const l = log({ entityType: "Holiday", details: JSON.stringify({ name: "Ostern", date: "2026-04-06" }) });
    expect(describeAuditLog(l, userNames)).toBe("Ostern (06.04.2026)");
  });

  it("describes a manually triggered notification check", () => {
    const l = log({
      entityType: "Settings",
      action: "SETTINGS",
      details: JSON.stringify({ action: "triggerNotificationCheck", queued: 4 }),
    });
    expect(describeAuditLog(l, userNames)).toBe("Benachrichtigungsprüfung manuell ausgelöst (4 eingereiht)");
  });

  it("falls back to JSON.stringify for unrecognized detail shapes", () => {
    const l = log({ entityType: "Settings", action: "SETTINGS", details: JSON.stringify({ foo: "bar" }) });
    expect(describeAuditLog(l, userNames)).toBe('{"foo":"bar"}');
  });
});
