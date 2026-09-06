import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

/**
 * SALT_ROUNDS=12 (password.ts) is a real bcrypt cost factor, not a test
 * fixture — each hash/compare call can legitimately take multiple seconds
 * under CPU contention (e.g. the full monorepo's `pnpm test` running 9
 * packages' vitest workers in parallel), which blew past vitest's 5000ms
 * default here. The fix is a longer per-test timeout, not weakening the
 * cost factor to make tests faster — that would trade real security for
 * test speed.
 */
const BCRYPT_TEST_TIMEOUT_MS = 20_000;

describe("password hashing", () => {
  it(
    "verifies a correct password against its hash",
    async () => {
      const hash = await hashPassword("correct horse battery staple");
      expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    },
    BCRYPT_TEST_TIMEOUT_MS,
  );

  it(
    "rejects an incorrect password",
    async () => {
      const hash = await hashPassword("correct horse battery staple");
      expect(await verifyPassword("wrong password", hash)).toBe(false);
    },
    BCRYPT_TEST_TIMEOUT_MS,
  );

  it(
    "never stores the plaintext in the hash",
    async () => {
      const hash = await hashPassword("correct horse battery staple");
      expect(hash).not.toContain("correct horse battery staple");
    },
    BCRYPT_TEST_TIMEOUT_MS,
  );

  it(
    "produces a different hash each time (salted)",
    async () => {
      const [hashA, hashB] = await Promise.all([
        hashPassword("same password"),
        hashPassword("same password"),
      ]);
      expect(hashA).not.toBe(hashB);
    },
    BCRYPT_TEST_TIMEOUT_MS,
  );
});
