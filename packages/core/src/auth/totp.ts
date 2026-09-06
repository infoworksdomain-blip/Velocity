import { createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

const ISSUER = "VELOCITY";
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 5; // -> 10 hex chars per code

export interface MfaEnrollment {
  /** Base32 TOTP secret — store encrypted (see packages/db/src/kms.ts), never in plaintext. */
  secretBase32: string;
  /** otpauth:// URL for rendering an enrollment QR code. Contains the secret — never log this. */
  otpAuthUrl: string;
  /** Plaintext recovery codes — show to the user exactly once at enrollment time. Store only their hashes (hashRecoveryCode). */
  recoveryCodes: string[];
}

export function enrollMfa(accountLabel: string): MfaEnrollment {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secretBase32: secret.base32,
    otpAuthUrl: totp.toString(),
    recoveryCodes: generateRecoveryCodes(),
  };
}

export function verifyTotpToken(secretBase32: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  // window: 1 tolerates the previous/next 30s step for clock drift.
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => randomBytes(RECOVERY_CODE_BYTES).toString("hex"));
}

/** Recovery codes are single-use, high-entropy, machine-generated tokens — hashed with SHA-256, not bcrypt (no brute-force-by-guessing concern the way a user-chosen password has). */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyRecoveryCode(code: string, hash: string): boolean {
  return hashRecoveryCode(code) === hash;
}
