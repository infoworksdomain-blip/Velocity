import type { ProviderEntry, ProviderKind, ProviderRegistryConfig } from "@velocity/contracts";
import type { AnyProvider } from "../types.js";
import type { ProviderConfigSource } from "./config-source.js";

export type ProviderFactory<T extends AnyProvider = AnyProvider> = (entry: ProviderEntry) => T;

export interface ProviderRegistryOptions {
  /**
   * How long a loaded config is trusted before the next `ensureLoaded()`
   * call re-reads it. Default 30s -- comfortably under GATE 18's literal
   * "a model kill switch takes effect within 60 seconds without a
   * deploy": every routing decision calls `ensureLoaded()`, so worst-case
   * staleness after an admin flips a provider's `enabled` flag in the DB
   * is one TTL window, not "until the process restarts."
   */
  reloadIntervalMs?: number;
  /** Injectable clock, so tests can fast-forward past the TTL without a real wall-clock wait (same pattern as STEP 11's token-refresh-daemon test). */
  now?: () => number;
}

/**
 * Holds the actual adapter instances, keyed by (kind, id), and the config
 * that decides which are enabled and how they rank. Adapters register a
 * factory once at worker boot; `reload()` re-reads config (e.g. after
 * STEP 18's kill switch flips a flag) without restarting the process --
 * `ensureLoaded()` also calls it automatically once the TTL expires, so a
 * DB-backed config source (STEP 18's `DbProviderConfigSource`) propagates
 * changes on its own, with no external scheduler required.
 */
export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();
  private readonly instances = new Map<string, AnyProvider>();
  private config: ProviderRegistryConfig | null = null;
  private lastLoadedAtMs: number | null = null;
  private readonly reloadIntervalMs: number;
  private readonly now: () => number;

  constructor(
    private readonly configSource: ProviderConfigSource,
    options: ProviderRegistryOptions = {},
  ) {
    this.reloadIntervalMs = options.reloadIntervalMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  private key(kind: ProviderKind, id: string): string {
    return `${kind}:${id}`;
  }

  register<T extends AnyProvider>(kind: ProviderKind, id: string, factory: ProviderFactory<T>): void {
    this.factories.set(this.key(kind, id), factory as ProviderFactory);
  }

  async reload(): Promise<void> {
    this.config = await this.configSource.load();
    this.lastLoadedAtMs = this.now();
  }

  private isStale(): boolean {
    if (this.config === null || this.lastLoadedAtMs === null) return true;
    return this.now() - this.lastLoadedAtMs >= this.reloadIntervalMs;
  }

  private async ensureLoaded(): Promise<ProviderRegistryConfig> {
    if (this.isStale()) await this.reload();
    return this.config!;
  }

  /** Every configured entry for a kind, enabled or not — the router itself decides what to filter. */
  async entries(kind: ProviderKind): Promise<ProviderEntry[]> {
    const config = await this.ensureLoaded();
    return config.providers.filter((p) => p.kind === kind);
  }

  async fallbackChainMaxLength(): Promise<number> {
    const config = await this.ensureLoaded();
    return config.fallbackChainMaxLength;
  }

  async defaultCostCeilingUsd(kind: ProviderKind): Promise<number> {
    const config = await this.ensureLoaded();
    return config.defaultCostCeilingUsd[kind];
  }

  /**
   * Instances are cached per (kind, id) — resolve() must return the SAME
   * instance across calls, not a fresh one each time. This matters even
   * beyond the stub adapters' in-memory job simulation: a real HTTP-backed
   * adapter benefits from a stable client (connection reuse), and nothing
   * about "select a provider" should imply "construct a new one." Found
   * as a genuine bug during STEP 8's own workflow testing: a stub
   * adapter's simulated job store was silently reset on every Temporal
   * activity retry because each call built a brand-new provider instance,
   * losing all record of jobs already submitted.
   */
  resolve<T extends AnyProvider>(kind: ProviderKind, entry: ProviderEntry): T {
    const key = this.key(kind, entry.id);
    const cached = this.instances.get(key);
    if (cached) return cached as T;

    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`No adapter factory registered for ${kind}:${entry.id} — register one before routing to it`);
    }
    const instance = factory(entry);
    this.instances.set(key, instance);
    return instance as T;
  }
}
