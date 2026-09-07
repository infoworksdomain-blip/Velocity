/**
 * Blob storage abstraction (STEP 8.4). Every render artefact — shots, VO,
 * composed output, C2PA manifests — is written through this, never a
 * direct S3/R2 SDK call from an activity. Keeps activities testable
 * against an in-memory store and makes the real backend (Cloudflare R2 +
 * CDN, per CLAUDE.md's stack) a one-file swap.
 */
export interface BlobStore {
  put(key: string, data: Buffer | string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  head(key: string): Promise<{ exists: boolean; sizeBytes: number } | null>;
  signedUrl(key: string): Promise<string>;
}
