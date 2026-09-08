import type { ProviderEntry, ProviderRegistryConfig } from "@velocity/contracts";
import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../registry.js";
import type { ProviderConfigSource } from "../config-source.js";

function entry(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    kind: "video",
    id: "kling-3.0",
    enabled: true,
    weight: 100,
    tiers: ["free", "starter", "growth", "pro"],
    adapter: "stub",
    credentials: {},
    breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 },
    ...overrides,
  };
}

function configWithProviders(providers: ProviderEntry[]): ProviderRegistryConfig {
  return {
    version: 1,
    providers,
    fallbackChainMaxLength: 3,
    defaultCostCeilingUsd: { video: 1, image: 1, tts: 1, transcription: 1, text: 1 },
  };
}

/** A mutable config source, so a test can simulate an admin flipping a DB row mid-run, plus a call counter to prove reload cadence. */
class MutableConfigSource implements ProviderConfigSource {
  loadCount = 0;
  constructor(public config: ProviderRegistryConfig) {}

  async load(): Promise<ProviderRegistryConfig> {
    this.loadCount += 1;
    return this.config;
  }
}

describe("ProviderRegistry TTL-based auto-reload (GATE 18: kill switch within 60s, no deploy)", () => {
  it("loads config once and reuses it for calls within the TTL window", async () => {
    let currentMs = 0;
    const source = new MutableConfigSource(configWithProviders([entry({ enabled: true })]));
    const registry = new ProviderRegistry(source, { reloadIntervalMs: 30_000, now: () => currentMs });

    await registry.entries("video");
    currentMs += 10_000;
    await registry.entries("video");
    currentMs += 10_000;
    await registry.entries("video");

    expect(source.loadCount).toBe(1);
  });

  it("re-reads the config once the TTL has elapsed, picking up a kill switch flip", async () => {
    let currentMs = 0;
    const source = new MutableConfigSource(configWithProviders([entry({ id: "kling-3.0", enabled: true })]));
    const registry = new ProviderRegistry(source, { reloadIntervalMs: 30_000, now: () => currentMs });

    const before = await registry.entries("video");
    expect(before[0]?.enabled).toBe(true);

    // Simulate an admin disabling the provider directly in the DB-backed source.
    source.config = configWithProviders([entry({ id: "kling-3.0", enabled: false })]);

    // Still inside the TTL window: the stale-but-cached config is served.
    currentMs += 29_000;
    const stillCached = await registry.entries("video");
    expect(stillCached[0]?.enabled).toBe(true);

    // Past the TTL (comfortably under GATE 18's 60s bound): re-reads and sees the flip.
    currentMs += 2_000; // total 31_000ms elapsed
    const afterReload = await registry.entries("video");
    expect(afterReload[0]?.enabled).toBe(false);
    expect(source.loadCount).toBe(2);
  });

  it("an explicit reload() call always re-reads, regardless of TTL", async () => {
    let currentMs = 0;
    const source = new MutableConfigSource(configWithProviders([entry({ weight: 50 })]));
    const registry = new ProviderRegistry(source, { reloadIntervalMs: 30_000, now: () => currentMs });

    await registry.entries("video");
    source.config = configWithProviders([entry({ weight: 90 })]);
    await registry.reload();

    const entries = await registry.entries("video");
    expect(entries[0]?.weight).toBe(90);
    expect(source.loadCount).toBe(2);
  });

  it("defaults reloadIntervalMs to 30s and now to Date.now when not provided", async () => {
    const source = new MutableConfigSource(configWithProviders([entry()]));
    const registry = new ProviderRegistry(source);
    await registry.entries("video");
    expect(source.loadCount).toBe(1);
  });
});
