import { describe, expect, it } from "vitest";
import { canAddSeat, isPlanKey, PLAN_SEAT_LIMITS, remainingSeats } from "../seat-limits";

describe("plan seat limits (provisional — STEP 19 owns the real model)", () => {
  it("allows adding a seat below the plan's limit", () => {
    expect(canAddSeat("starter", 2)).toBe(true);
  });

  it("blocks adding a seat at the plan's limit", () => {
    expect(canAddSeat("free", 1)).toBe(false);
  });

  it("blocks adding a seat over the plan's limit", () => {
    expect(canAddSeat("growth", 15)).toBe(false);
  });

  it("computes remaining seats down to zero, never negative", () => {
    expect(remainingSeats("starter", 1)).toBe(2);
    expect(remainingSeats("starter", 10)).toBe(0);
  });

  it("every plan has a positive seat limit", () => {
    for (const limit of Object.values(PLAN_SEAT_LIMITS)) {
      expect(limit).toBeGreaterThan(0);
    }
  });

  it("isPlanKey narrows an arbitrary string safely", () => {
    expect(isPlanKey("pro")).toBe(true);
    expect(isPlanKey("enterprise")).toBe(false);
  });
});
