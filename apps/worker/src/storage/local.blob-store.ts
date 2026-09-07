import type { BlobStore } from "./blob-store.js";

/** In-memory blob store for dev/test — real and fully functional, just not durable across process restarts. The production backend (R2) is a config change behind the same interface. */
export class InMemoryBlobStore implements BlobStore {
  private readonly store = new Map<string, Buffer>();

  async put(key: string, data: Buffer | string): Promise<void> {
    this.store.set(key, typeof data === "string" ? Buffer.from(data) : data);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key) ?? null;
  }

  async head(key: string): Promise<{ exists: boolean; sizeBytes: number } | null> {
    const data = this.store.get(key);
    if (!data) return { exists: false, sizeBytes: 0 };
    return { exists: true, sizeBytes: data.length };
  }

  async signedUrl(key: string): Promise<string> {
    return `memory://${key}`;
  }
}
