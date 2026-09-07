import type { ProviderRegistryConfig, RouterCriteria } from "@velocity/contracts";
import { describe, expect, it } from "vitest";
import { createKlingStubProvider } from "../adapters/video/kling.stub.js";
import { createVeoStubProvider } from "../adapters/video/veo.stub.js";
import { CircuitBreaker, InMemoryBreakerStore } from "../router/circuit-breaker.js";
import { StaticProviderConfigSource } from "../router/config-source.js";
import { ProviderRegistry } from "../router/registry.js";
import { NoEligibleProviderError, selectChain, selectOne } from "../router/select.js";
import type { VideoProvider } from "../types.js";

function makeVideoProvider(overrides: Partial<VideoProvider["capabilities"]> = {}, id = "test-video"): VideoProvider {
  return {
    id,
    capabilities: {
      commercialUse: true,
      tiers: ["free", "starter", "growth", "pro"],
      maxDurationSec: 10,
      resolutions: ["1080x1920"],
      nativeAudio: false,
      lipSync: false,
      imageToVideo: false,
      watermark: "none",
      costPerSecond: 0.1,
      ...overrides,
    },
    estimateCost: (input) => input.durationSec * (overrides.costPerSecond ?? 0.1),
    generate: async () => ({ providerId: id, externalJobId: "job1" }),
    poll: async () => ({ state: "succeeded", costUsd: 0 }),
  };
}

function baseConfig(providers: ProviderRegistryConfig["providers"]): ProviderRegistryConfig {
  return {
    version: 1,
    providers,
    fallbackChainMaxLength: 3,
    defaultCostCeilingUsd: { video: 1, image: 1, tts: 1, transcription: 1 },
  };
}

function baseCriteria(overrides: Partial<RouterCriteria> = {}): RouterCriteria {
  return {
    kind: "video",
    workspaceTier: "growth",
    costCeilingUsd: 5,
    required: { commercialUse: true },
    jobShape: { durationSec: 5 },
    ...overrides,
  };
}

describe("selectChain — the ordered filter pipeline (ADR 0004)", () => {
  it("stage 1: drops a disabled provider", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: false, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({}, "p1"));

    const { chain, rejections } = await selectChain(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria());
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "enabled" });
  });

  it("stage 2: drops a provider not available on the workspace's tier", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["pro"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({}, "p1"));

    const { chain, rejections } = await selectChain(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria({ workspaceTier: "free" }));
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "tier" });
  });

  it("stage 3: drops a provider that can't meet a hard capability requirement", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({ lipSync: false }, "p1"));

    const { chain, rejections } = await selectChain(
      registry,
      new CircuitBreaker(new InMemoryBreakerStore()),
      baseCriteria({ required: { commercialUse: true, lipSync: true } }),
    );
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "capability" });
  });

  it("stage 4: drops a provider without commercial-use rights — this must never be optional", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({ commercialUse: false }, "p1"));

    const { chain, rejections } = await selectChain(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria());
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "compliance" });
  });

  it("stage 4: drops a provider whose watermark policy isn't in the acceptable set", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({ watermark: "forced" }, "p1"));

    const { chain, rejections } = await selectChain(
      registry,
      new CircuitBreaker(new InMemoryBreakerStore()),
      baseCriteria({ required: { commercialUse: true, watermarkPolicy: ["none", "model"] } }),
    );
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "compliance" });
  });

  it("stage 5: cost ceiling runs AFTER capability match — a cheap incapable provider must not win on price", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([
          { kind: "video", id: "cheap-incapable", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
          { kind: "video", id: "expensive-capable", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
        ]),
      ),
    );
    registry.register("video", "cheap-incapable", () => makeVideoProvider({ lipSync: false, costPerSecond: 0.01 }, "cheap-incapable"));
    registry.register("video", "expensive-capable", () => makeVideoProvider({ lipSync: true, costPerSecond: 0.9 }, "expensive-capable"));

    const { chain } = await selectChain(
      registry,
      new CircuitBreaker(new InMemoryBreakerStore()),
      baseCriteria({ required: { commercialUse: true, lipSync: true }, costCeilingUsd: 10 }),
    );
    expect(chain.map((c) => c.providerId)).toEqual(["expensive-capable"]);
  });

  it("stage 5: drops a provider whose estimated cost exceeds the ceiling", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({ costPerSecond: 5 }, "p1"));

    const { chain, rejections } = await selectChain(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria({ costCeilingUsd: 1 }));
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "cost_ceiling" });
  });

  it("stage 6: drops a provider with an open circuit breaker", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: true, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 1, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({}, "p1"));

    const breaker = new CircuitBreaker(new InMemoryBreakerStore());
    breaker.recordFailure("p1", { failureThreshold: 1, windowSec: 60, cooldownSec: 120 });

    const { chain, rejections } = await selectChain(registry, breaker, baseCriteria());
    expect(chain).toEqual([]);
    expect(rejections[0]).toMatchObject({ providerId: "p1", stage: "breaker" });
  });

  it("stage 7-8: ranks by weight desc, then cost asc, then id asc, and truncates to fallbackChainMaxLength", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource({
        version: 1,
        providers: [
          { kind: "video", id: "low-weight", enabled: true, weight: 10, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
          { kind: "video", id: "high-weight-a", enabled: true, weight: 90, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
          { kind: "video", id: "high-weight-b", enabled: true, weight: 90, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
        ],
        fallbackChainMaxLength: 2,
        defaultCostCeilingUsd: { video: 1, image: 1, tts: 1, transcription: 1 },
      }),
    );
    registry.register("video", "low-weight", () => makeVideoProvider({ costPerSecond: 0.01 }, "low-weight"));
    registry.register("video", "high-weight-a", () => makeVideoProvider({ costPerSecond: 0.05 }, "high-weight-a"));
    registry.register("video", "high-weight-b", () => makeVideoProvider({ costPerSecond: 0.02 }, "high-weight-b"));

    const { chain } = await selectChain(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria());
    // Both high-weight providers rank above low-weight; between them, lower cost wins. Truncated to 2.
    expect(chain.map((c) => c.providerId)).toEqual(["high-weight-b", "high-weight-a"]);
  });

  it("selectOne throws NoEligibleProviderError carrying every rejection reason when the chain is empty", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "p1", enabled: false, weight: 50, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    registry.register("video", "p1", () => makeVideoProvider({}, "p1"));

    await expect(selectOne(registry, new CircuitBreaker(new InMemoryBreakerStore()), baseCriteria())).rejects.toThrow(NoEligibleProviderError);
  });

  it("real stub adapters (Kling, Veo) are routable end-to-end through the full pipeline", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource({
        version: 1,
        providers: [
          { kind: "video", id: "kling-3.0", enabled: true, weight: 100, tiers: ["growth", "pro"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
          { kind: "video", id: "veo-3.1", enabled: true, weight: 60, tiers: ["growth", "pro"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } },
        ],
        fallbackChainMaxLength: 3,
        defaultCostCeilingUsd: { video: 5, image: 1, tts: 1, transcription: 1 },
      }),
    );
    registry.register("video", "kling-3.0", (entry) => createKlingStubProvider(entry.tiers));
    registry.register("video", "veo-3.1", (entry) => createVeoStubProvider(entry.tiers));

    const { selection, provider } = await selectOne(
      registry,
      new CircuitBreaker(new InMemoryBreakerStore()),
      baseCriteria({ workspaceTier: "growth", jobShape: { durationSec: 4 } }),
    );
    expect(selection.providerId).toBe("kling-3.0");

    const handle = await (provider as VideoProvider).generate({ prompt: "test", durationSec: 4, resolution: "1080x1920" });
    expect(handle.providerId).toBe("kling-3.0");
  });

  it("resolve() returns the SAME provider instance across calls — a stub's in-memory job state (or a real adapter's connection pool) must survive repeated resolution, e.g. across a Temporal activity retry", async () => {
    const registry = new ProviderRegistry(
      new StaticProviderConfigSource(
        baseConfig([{ kind: "video", id: "kling-3.0", enabled: true, weight: 100, tiers: ["growth"], adapter: "stub", credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } }]),
      ),
    );
    let factoryCallCount = 0;
    registry.register("video", "kling-3.0", (entry) => {
      factoryCallCount += 1;
      return createKlingStubProvider(entry.tiers);
    });

    const entry = { kind: "video" as const, id: "kling-3.0", enabled: true, weight: 100, tiers: ["growth"], adapter: "stub" as const, credentials: {}, breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 } };
    const first = registry.resolve<VideoProvider>("video", entry);
    const second = registry.resolve<VideoProvider>("video", entry);

    expect(second).toBe(first);
    expect(factoryCallCount).toBe(1);

    // The regression this guards: a job submitted through the first
    // resolved instance must still be pollable through a later resolve()
    // call — simulating a Temporal activity that re-resolves the provider
    // on retry after having already called generate() once.
    const handle = await first.generate({ prompt: "x", durationSec: 2, resolution: "1080x1920" });
    const resolvedAgain = registry.resolve<VideoProvider>("video", entry);
    await expect(resolvedAgain.poll(handle)).resolves.not.toThrow();
  });
});
