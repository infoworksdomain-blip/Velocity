import { describe, expect, it } from "vitest";
import { checkSpendCap } from "../spend-cap";

describe("checkSpendCap", () => {
  it("always allows when there is no cap configured", () => {
    expect(checkSpendCap(1000, null).allowed).toBe(true);
  });

  it("allows spend that stays within the cap", () => {
    const result = checkSpendCap(5, 10, 2);
    expect(result.allowed).toBe(true);
  });

  it("blocks spend that would exceed the cap", () => {
    const result = checkSpendCap(9, 10, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceed the $10.00 cap");
  });

  it("allows spend that lands exactly on the cap", () => {
    expect(checkSpendCap(5, 10, 5).allowed).toBe(true);
  });

  it("blocks when current spend alone already exceeds the cap, even with zero projected additional cost", () => {
    const result = checkSpendCap(15, 10, 0);
    expect(result.allowed).toBe(false);
  });
});
