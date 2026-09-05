import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * KMS abstraction (STEP 2 design decision 2, mirroring ADR 0004's provider
 * pattern). Only the local-dev adapter is implemented here — a real cloud
 * adapter (AWS KMS / GCP KMS) is deliberately not invented since its
 * request/response shape depends on whichever provider is actually chosen
 * for production; that adapter gets written against real documentation
 * when that decision is made, not guessed at now.
 */
export interface KmsProvider {
  id: string;
  encrypt(plaintext: string): Promise<{ ciphertext: string; keyId: string }>;
  decrypt(ciphertext: string, keyId: string): Promise<string>;
}

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** AES-256-GCM with a single static key from ENCRYPTION_KEY. Local dev / CI only — never selected in production config. */
export class LocalDevKmsProvider implements KmsProvider {
  readonly id = "local-dev";
  private readonly key: Buffer;

  constructor(encryptionKeyHex: string) {
    if (!/^[0-9a-f]{64}$/i.test(encryptionKeyHex)) {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256-GCM");
    }
    this.key = Buffer.from(encryptionKeyHex, "hex");
  }

  async encrypt(plaintext: string): Promise<{ ciphertext: string; keyId: string }> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
    return { ciphertext: payload, keyId: this.id };
  }

  async decrypt(ciphertext: string, keyId: string): Promise<string> {
    if (keyId !== this.id) {
      throw new Error(`LocalDevKmsProvider cannot decrypt a payload encrypted under key "${keyId}"`);
    }
    const buffer = Buffer.from(ciphertext, "base64");
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}

export function createKmsProvider(): KmsProvider {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return new LocalDevKmsProvider(encryptionKey);
}
