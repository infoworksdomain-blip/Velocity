/** A valid 32-byte hex test fixture key — never a real secret — so `createKmsProvider()` (STEP 12's publish activities) has something to decrypt platform_credentials with in tests. */
export function useTestEncryptionKeyForTests(): void {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
}
