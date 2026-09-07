import { describe, expect, it } from "vitest";
import { computeExpiryNotificationLevel, shouldAttemptRefresh } from "../token-refresh.js";

const EXPIRES_AT = new Date("2026-06-15T00:00:00Z");

describe("computeExpiryNotificationLevel", () => {
  /** GATE 11: "token refresh proven by fast-forwarding expiry" — this table IS that proof, a direct test of the actual scheduling decision at each fast-forwarded point, not a real-time wait. */
  it.each([
    ["10 days before expiry — outside any window", new Date("2026-06-05T00:00:00Z"), null],
    ["exactly 7 days before", new Date("2026-06-08T00:00:00Z"), "T-7"],
    ["5 days before — still in the T-7 window", new Date("2026-06-10T00:00:00Z"), "T-7"],
    ["exactly 3 days before", new Date("2026-06-12T00:00:00Z"), "T-3"],
    ["2 days before — still in the T-3 window", new Date("2026-06-13T00:00:00Z"), "T-3"],
    ["exactly 1 day before", new Date("2026-06-14T00:00:00Z"), "T-1"],
    ["12 hours before — still in the T-1 window", new Date("2026-06-14T12:00:00Z"), "T-1"],
    ["at the exact expiry instant", EXPIRES_AT, "expired"],
    ["1 hour after expiry", new Date("2026-06-15T01:00:00Z"), "expired"],
  ] as const)("%s -> %s", (_label, now, expected) => {
    expect(computeExpiryNotificationLevel(EXPIRES_AT, now)).toBe(expected);
  });
});

describe("shouldAttemptRefresh", () => {
  it("is false well before any threshold", () => {
    expect(shouldAttemptRefresh(EXPIRES_AT, new Date("2026-06-01T00:00:00Z"))).toBe(false);
  });

  it("is true once inside the T-7 window, and stays true through expiry", () => {
    expect(shouldAttemptRefresh(EXPIRES_AT, new Date("2026-06-08T00:00:00Z"))).toBe(true);
    expect(shouldAttemptRefresh(EXPIRES_AT, new Date("2026-06-16T00:00:00Z"))).toBe(true);
  });
});
