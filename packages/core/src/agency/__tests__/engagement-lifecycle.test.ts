import { describe, expect, it } from "vitest";
import { canApproveEngagement, canTransitionEngagement } from "../engagement-lifecycle";

describe("canTransitionEngagement", () => {
  it("allows the real happy path: briefed -> accepted -> delivered -> approved -> paid", () => {
    expect(canTransitionEngagement("briefed", "accepted").allowed).toBe(true);
    expect(canTransitionEngagement("accepted", "delivered").allowed).toBe(true);
    expect(canTransitionEngagement("delivered", "approved").allowed).toBe(true);
    expect(canTransitionEngagement("approved", "paid").allowed).toBe(true);
  });

  it("allows a rejected delivery to be re-delivered (a real creative feedback loop)", () => {
    expect(canTransitionEngagement("delivered", "rejected").allowed).toBe(true);
    expect(canTransitionEngagement("rejected", "delivered").allowed).toBe(true);
  });

  it("allows cancellation only before real creative work has happened", () => {
    expect(canTransitionEngagement("briefed", "cancelled").allowed).toBe(true);
    expect(canTransitionEngagement("accepted", "cancelled").allowed).toBe(true);
    expect(canTransitionEngagement("delivered", "cancelled").allowed).toBe(false);
    expect(canTransitionEngagement("approved", "cancelled").allowed).toBe(false);
  });

  it("rejects skipping stages, e.g. briefed straight to paid", () => {
    const result = canTransitionEngagement("briefed", "paid");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("briefed");
  });

  it("treats paid and cancelled as terminal — no further transitions", () => {
    expect(canTransitionEngagement("paid", "approved").allowed).toBe(false);
    expect(canTransitionEngagement("cancelled", "briefed").allowed).toBe(false);
  });
});

describe("canApproveEngagement", () => {
  it("blocks approval without the paid-partnership disclosure confirmed, even from a valid state", () => {
    const result = canApproveEngagement({ status: "delivered", paidPartnershipDisclosure: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("disclosure");
  });

  it("allows approval when delivered and disclosure is confirmed", () => {
    expect(canApproveEngagement({ status: "delivered", paidPartnershipDisclosure: true }).allowed).toBe(true);
  });

  it("blocks approval from an invalid state regardless of disclosure", () => {
    const result = canApproveEngagement({ status: "briefed", paidPartnershipDisclosure: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("briefed");
  });
});
