import type { ProviderEntry, RejectionReason, RouterCriteria, SelectionResult } from "@velocity/contracts";
import type { AnyProvider } from "../types.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import type { ProviderRegistry } from "./registry.js";

/**
 * Thrown when every candidate is eliminated. Carries the per-stage
 * rejection reasons so "why did it pick that" (or "why did it pick
 * nothing") is answerable from the error, not just from re-reading the
 * router's source. ADR 0004: a router that silently falls back to an
 * over-budget or non-compliant provider is the exact failure this
 * abstraction exists to prevent — so an empty chain is always an error,
 * never a quiet default.
 */
export class NoEligibleProviderError extends Error {
  constructor(public readonly rejections: RejectionReason[]) {
    super(
      `No eligible provider found. Rejections:\n${rejections.map((r) => `  ${r.providerId} [${r.stage}]: ${r.detail}`).join("\n")}`,
    );
    this.name = "NoEligibleProviderError";
  }
}

/** Dynamic field access into a provider's capability manifest — deliberately loose here, since the manifest shape legitimately differs per provider kind (a TTS provider has no `resolutions`, a video provider has no `costPerCharacter`). */
type CapabilityBag = Record<string, unknown>;

function capabilitiesOf(provider: AnyProvider): CapabilityBag {
  return provider.capabilities as unknown as CapabilityBag;
}

function estimateCostOf(provider: AnyProvider, criteria: RouterCriteria): number {
  const caps = capabilitiesOf(provider);
  const { jobShape } = criteria;
  if (typeof caps.costPerSecond === "number" && jobShape.durationSec) return caps.costPerSecond * jobShape.durationSec;
  if (typeof caps.costPerImage === "number" && jobShape.imageCount) return caps.costPerImage * jobShape.imageCount;
  if (typeof caps.costPerCharacter === "number" && jobShape.characters) return caps.costPerCharacter * jobShape.characters;
  return 0;
}

function checkCapabilityMatch(provider: AnyProvider, criteria: RouterCriteria): string | null {
  const caps = capabilitiesOf(provider);
  const { required, jobShape } = criteria;

  const durationSec = jobShape.durationSec ?? required.durationSec;
  if (durationSec !== undefined && typeof caps.maxDurationSec === "number" && caps.maxDurationSec < durationSec) {
    return `maxDurationSec ${caps.maxDurationSec} < required ${durationSec}`;
  }
  if (required.resolution !== undefined && Array.isArray(caps.resolutions) && !caps.resolutions.includes(required.resolution)) {
    return `resolutions [${caps.resolutions.join(", ")}] does not include required ${required.resolution}`;
  }
  if (required.lipSync === true && caps.lipSync !== true) return "lipSync required but not supported";
  if (required.imageToVideo === true && caps.imageToVideo !== true) return "imageToVideo required but not supported";
  if (required.nativeAudio === true && caps.nativeAudio !== true) return "nativeAudio required but not supported";
  return null;
}

function checkCompliance(provider: AnyProvider, criteria: RouterCriteria): string | null {
  const caps = capabilitiesOf(provider);
  if (caps.commercialUse !== true) return "commercialUse is not true — never optional (C3/licensing)";
  if (criteria.required.watermarkPolicy && typeof caps.watermark === "string") {
    if (!criteria.required.watermarkPolicy.includes(caps.watermark as never)) {
      return `watermark policy "${caps.watermark}" not in acceptable set [${criteria.required.watermarkPolicy.join(", ")}]`;
    }
  }
  return null;
}

/**
 * The ordered filter pipeline (ADR 0004). Each stage narrows the candidate
 * set and every rejection is recorded with its reason, so a "why did it
 * pick that" question is answerable from `rejections`, not just from
 * re-reading this file. Cost-ceiling (stage 5) deliberately comes after
 * capability match (stage 3) — otherwise a cheap provider that can't do
 * the job would win on price before being disqualified on capability.
 */
export function selectChain(
  registry: { entries: (kind: RouterCriteria["kind"]) => Promise<ProviderEntry[]>; resolve: ProviderRegistry["resolve"]; fallbackChainMaxLength: () => Promise<number> },
  breaker: CircuitBreaker,
  criteria: RouterCriteria,
): Promise<{ chain: SelectionResult[]; providers: Map<string, AnyProvider>; rejections: RejectionReason[] }> {
  return selectChainImpl(registry, breaker, criteria);
}

async function selectChainImpl(
  registry: { entries: (kind: RouterCriteria["kind"]) => Promise<ProviderEntry[]>; resolve: ProviderRegistry["resolve"]; fallbackChainMaxLength: () => Promise<number> },
  breaker: CircuitBreaker,
  criteria: RouterCriteria,
): Promise<{ chain: SelectionResult[]; providers: Map<string, AnyProvider>; rejections: RejectionReason[] }> {
  const rejections: RejectionReason[] = [];
  const entries = await registry.entries(criteria.kind);
  const providers = new Map<string, AnyProvider>();

  interface Candidate {
    entry: ProviderEntry;
    provider: AnyProvider;
    estimatedCostUsd: number;
    breakerRank: number; // 0 = closed (preferred), 1 = half_open (trial, ranked last)
  }
  const candidates: Candidate[] = [];

  for (const entry of entries) {
    // 1. ENABLED
    if (!entry.enabled) {
      rejections.push({ providerId: entry.id, stage: "enabled", detail: "disabled in config" });
      continue;
    }
    // 2. TIER
    if (!entry.tiers.includes(criteria.workspaceTier)) {
      rejections.push({ providerId: entry.id, stage: "tier", detail: `not available on tier ${criteria.workspaceTier}` });
      continue;
    }

    const provider = registry.resolve<AnyProvider>(criteria.kind, entry);
    providers.set(entry.id, provider);

    // 3. CAPABILITY
    const capabilityRejection = checkCapabilityMatch(provider, criteria);
    if (capabilityRejection) {
      rejections.push({ providerId: entry.id, stage: "capability", detail: capabilityRejection });
      continue;
    }

    // 4. COMPLIANCE
    const complianceRejection = checkCompliance(provider, criteria);
    if (complianceRejection) {
      rejections.push({ providerId: entry.id, stage: "compliance", detail: complianceRejection });
      continue;
    }

    // 5. COST CEILING
    const estimatedCostUsd = estimateCostOf(provider, criteria);
    if (estimatedCostUsd > criteria.costCeilingUsd) {
      rejections.push({
        providerId: entry.id,
        stage: "cost_ceiling",
        detail: `estimated cost $${estimatedCostUsd.toFixed(4)} exceeds ceiling $${criteria.costCeilingUsd.toFixed(4)}`,
      });
      continue;
    }

    // 6. BREAKER
    const breakerState = breaker.state(entry.id, entry.breaker);
    if (breakerState === "open") {
      rejections.push({ providerId: entry.id, stage: "breaker", detail: "circuit open" });
      continue;
    }

    candidates.push({ entry, provider, estimatedCostUsd, breakerRank: breakerState === "half_open" ? 1 : 0 });
  }

  // 7. RANK — (breaker state asc, weight desc, cost asc, id asc). id tiebreak is what makes this deterministic.
  candidates.sort((a, b) => {
    if (a.breakerRank !== b.breakerRank) return a.breakerRank - b.breakerRank;
    if (a.entry.weight !== b.entry.weight) return b.entry.weight - a.entry.weight;
    if (a.estimatedCostUsd !== b.estimatedCostUsd) return a.estimatedCostUsd - b.estimatedCostUsd;
    return a.entry.id.localeCompare(b.entry.id);
  });

  // 8. TRUNCATE
  const maxLength = await registry.fallbackChainMaxLength();
  const chain: SelectionResult[] = candidates.slice(0, maxLength).map((c, rank) => ({
    providerId: c.entry.id,
    estimatedCostUsd: c.estimatedCostUsd,
    reason: `rank ${rank}: weight=${c.entry.weight}, cost=$${c.estimatedCostUsd.toFixed(4)}, breaker=${c.breakerRank === 0 ? "closed" : "half_open"}`,
    rank,
  }));

  return { chain, providers, rejections };
}

/** Convenience wrapper: the single best provider, or throws with full rejection context. */
export async function selectOne(
  registry: { entries: (kind: RouterCriteria["kind"]) => Promise<ProviderEntry[]>; resolve: ProviderRegistry["resolve"]; fallbackChainMaxLength: () => Promise<number> },
  breaker: CircuitBreaker,
  criteria: RouterCriteria,
): Promise<{ selection: SelectionResult; provider: AnyProvider }> {
  const { chain, providers, rejections } = await selectChain(registry, breaker, criteria);
  const selection = chain[0];
  if (!selection) throw new NoEligibleProviderError(rejections);
  const provider = providers.get(selection.providerId);
  if (!provider) throw new Error(`Selected provider ${selection.providerId} was not resolved — this is a router bug`);
  return { selection, provider };
}
