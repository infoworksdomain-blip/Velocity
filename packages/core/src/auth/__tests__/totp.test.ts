import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";
import { enrollMfa, hashRecoveryCode, verifyRecoveryCode, verifyTotpToken } from "../totp";

/** GATE 3: "MFA enrolment and recovery work end to end." Fully self-contained — no DB, no external service. */
describe("MFA enrollment and verification", () => {
  it("generates a secret, otpauth URL, and 10 recovery codes", () => {
    const enrollment = enrollMfa("owner@demo.velocity");
    expect(enrollment.secretBase32.length).toBeGreaterThan(0);
    expect(enrollment.otpAuthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(enrollment.recoveryCodes).toHaveLength(10);
    expect(new Set(enrollment.recoveryCodes).size).toBe(10); // no duplicates
  });

  it("verifies a currently-valid TOTP token generated from the same secret", () => {
    const enrollment = enrollMfa("owner@demo.velocity");
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(enrollment.secretBase32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const validToken = totp.generate();
    expect(verifyTotpToken(enrollment.secretBase32, validToken)).toBe(true);
  });

  it("rejects a token that does not match the secret", () => {
    const enrollment = enrollMfa("owner@demo.velocity");
    expect(verifyTotpToken(enrollment.secretBase32, "000000")).toBe(false);
  });

  it("rejects a malformed token without throwing", () => {
    const enrollment = enrollMfa("owner@demo.velocity");
    expect(verifyTotpToken(enrollment.secretBase32, "not-a-token")).toBe(false);
  });

  it("recovery codes verify against their own hash and not against each other", () => {
    const enrollment = enrollMfa("owner@demo.velocity");
    const [codeA, codeB] = enrollment.recoveryCodes;
    const hashA = hashRecoveryCode(codeA!);

    expect(verifyRecoveryCode(codeA!, hashA)).toBe(true);
    expect(verifyRecoveryCode(codeB!, hashA)).toBe(false);
  });

  it("a used recovery code is the caller's responsibility to invalidate (usedAt), not this module's", () => {
    // This module is intentionally stateless — it only proves a code
    // matches a hash. "Used" tracking lives in mfa_recovery_codes.used_at
    // (packages/db/src/schema/auth.ts) and is enforced by the tRPC
    // procedure that consumes a recovery code, not here.
    const enrollment = enrollMfa("owner@demo.velocity");
    const hash = hashRecoveryCode(enrollment.recoveryCodes[0]!);
    expect(verifyRecoveryCode(enrollment.recoveryCodes[0]!, hash)).toBe(true);
    expect(verifyRecoveryCode(enrollment.recoveryCodes[0]!, hash)).toBe(true); // still matches; caller must check used_at
  });
});
