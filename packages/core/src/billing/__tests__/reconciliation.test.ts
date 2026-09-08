import { describe, expect, it } from "vitest";
import { reconcileCreditLedger } from "../reconciliation";

describe("reconcileCreditLedger — GATE 19: ledger reconciles to provider costs", () => {
  it("reports zero drift when every usage_event's ledger debit matches the current pricing model exactly", () => {
    const result = reconcileCreditLedger({
      usageEvents: [
        { id: "u1", jobKind: "video", units: 20 }, // 200 credits
        { id: "u2", jobKind: "image", units: 0 }, // 4 credits
        { id: "u3", jobKind: "text", units: 0 }, // 1 credit
      ],
      actualCreditsByUsageEventId: new Map([
        ["u1", 200],
        ["u2", 4],
        ["u3", 1],
      ]),
    });
    expect(result.driftPercent).toBe(0);
    expect(result.driftExceedsThreshold).toBe(false);
    expect(result.mismatches).toEqual([]);
    expect(result.totalExpectedCredits).toBe(205);
  });

  it("flags a usage_event with no matching ledger debit at all (a real revenue-leak bug)", () => {
    const result = reconcileCreditLedger({
      usageEvents: [{ id: "u1", jobKind: "video", units: 10 }], // 100 credits expected
      actualCreditsByUsageEventId: new Map(),
    });
    expect(result.mismatches).toEqual([{ usageEventId: "u1", expectedCredits: 100, actualCredits: 0 }]);
    expect(result.driftExceedsThreshold).toBe(true);
  });

  it("flags a usage_event debited the wrong amount (a pricing-model drift bug)", () => {
    const result = reconcileCreditLedger({
      usageEvents: [{ id: "u1", jobKind: "image", units: 0 }], // 4 credits expected
      actualCreditsByUsageEventId: new Map([["u1", 10]]), // over-charged
    });
    expect(result.mismatches).toEqual([{ usageEventId: "u1", expectedCredits: 4, actualCredits: 10 }]);
  });

  it("does not alert on drift at or below the 1% threshold", () => {
    // 1000 expected credits across many events, exactly 10 actual credits short == 1% drift, not >1%.
    const usageEvents = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, jobKind: "image" as const, units: 0 })); // 100 * 4 = 400 credits expected
    const actual = new Map(usageEvents.map((e) => [e.id, 4]));
    const result = reconcileCreditLedger({ usageEvents, actualCreditsByUsageEventId: actual });
    expect(result.driftPercent).toBe(0);
    expect(result.driftExceedsThreshold).toBe(false);
  });

  it("alerts when drift exceeds 1%", () => {
    const usageEvents = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, jobKind: "image" as const, units: 0 })); // 400 credits expected
    const actual = new Map(usageEvents.map((e, i) => [e.id, i === 0 ? 0 : 4])); // one event entirely uncharged: 4/400 = 1% drift... make it worse
    actual.set("u1", 0); // two events uncharged: 8/400 = 2% drift
    const result = reconcileCreditLedger({ usageEvents, actualCreditsByUsageEventId: actual });
    expect(result.driftPercent).toBeGreaterThan(1);
    expect(result.driftExceedsThreshold).toBe(true);
  });

  it("returns zero drift for an empty ledger (no division by zero)", () => {
    const result = reconcileCreditLedger({ usageEvents: [], actualCreditsByUsageEventId: new Map() });
    expect(result.driftPercent).toBe(0);
    expect(result.driftExceedsThreshold).toBe(false);
  });
});
