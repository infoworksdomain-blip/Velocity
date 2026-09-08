import { describe, expect, it } from "vitest";
import { checkEscrowRelease, computeEscrowBalance, fundEscrow, refundEscrowToWorkspace, releaseEscrowToCreator } from "../escrow";

describe("escrow movements", () => {
  it("fundEscrow credits the ledger by the real amount", () => {
    expect(fundEscrow(500)).toEqual({ debit: 0, credit: 500, reason: "funded" });
  });

  it("releaseEscrowToCreator debits the ledger by the real amount", () => {
    expect(releaseEscrowToCreator(500)).toEqual({ debit: 500, credit: 0, reason: "released_to_creator" });
  });

  it("refundEscrowToWorkspace debits the ledger by the real amount", () => {
    expect(refundEscrowToWorkspace(200)).toEqual({ debit: 200, credit: 0, reason: "refunded_to_workspace" });
  });

  it("rejects a non-positive funding amount", () => {
    expect(() => fundEscrow(0)).toThrow();
    expect(() => fundEscrow(-10)).toThrow();
  });
});

describe("computeEscrowBalance", () => {
  it("sums credit minus debit across real movements", () => {
    const movements = [fundEscrow(500), releaseEscrowToCreator(300)];
    expect(computeEscrowBalance(movements)).toBe(200);
  });

  it("returns 0 for no movements", () => {
    expect(computeEscrowBalance([])).toBe(0);
  });
});

describe("checkEscrowRelease", () => {
  it("allows a release within the current balance", () => {
    expect(checkEscrowRelease(500, 300).allowed).toBe(true);
  });

  it("allows a release exactly matching the balance", () => {
    expect(checkEscrowRelease(500, 500).allowed).toBe(true);
  });

  it("blocks a release exceeding the current balance — the real invariant that keeps escrowed funds safe until approval", () => {
    const result = checkEscrowRelease(300, 500);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("exceeds");
  });
});
