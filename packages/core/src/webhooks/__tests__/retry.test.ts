import { describe, expect, it } from "vitest";
import { computeNextRetryDelaySeconds, isExhausted, MAX_DELIVERY_ATTEMPTS } from "../retry";

describe("computeNextRetryDelaySeconds", () => {
  it("doubles the delay with each attempt (real exponential backoff)", () => {
    const d1 = computeNextRetryDelaySeconds(1);
    const d2 = computeNextRetryDelaySeconds(2);
    const d3 = computeNextRetryDelaySeconds(3);
    expect(d2).toBe(d1 * 2);
    expect(d3).toBe(d2 * 2);
  });

  it("caps the delay rather than growing unbounded", () => {
    const veryLateAttempt = computeNextRetryDelaySeconds(20);
    const evenLater = computeNextRetryDelaySeconds(30);
    expect(veryLateAttempt).toBe(evenLater);
  });
});

describe("isExhausted", () => {
  it("is not exhausted before the max attempt count", () => {
    expect(isExhausted(MAX_DELIVERY_ATTEMPTS - 1)).toBe(false);
  });

  it("is exhausted at the max attempt count", () => {
    expect(isExhausted(MAX_DELIVERY_ATTEMPTS)).toBe(true);
  });

  it("is exhausted beyond the max attempt count", () => {
    expect(isExhausted(MAX_DELIVERY_ATTEMPTS + 5)).toBe(true);
  });
});
