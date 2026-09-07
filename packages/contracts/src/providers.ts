import { z } from "zod";

/**
 * Provider registry + router contracts (ADR 0004, STEP 8.1). The config
 * file (config/providers.json) is validated against ProviderRegistryConfigSchema
 * at load time — a malformed config fails fast at worker boot, not mid-render.
 */

export const ProviderKindSchema = z.enum(["video", "image", "tts", "transcription"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const WatermarkPolicySchema = z.enum(["none", "model", "forced"]);
export type WatermarkPolicy = z.infer<typeof WatermarkPolicySchema>;

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive().default(5),
  windowSec: z.number().int().positive().default(60),
  cooldownSec: z.number().int().positive().default(120),
});
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

export const ProviderEntrySchema = z.object({
  kind: ProviderKindSchema,
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  weight: z.number().int().min(0).max(100).default(50),
  tiers: z.array(z.string()).min(1),
  adapter: z.enum(["stub", "http"]).default("stub"),
  credentials: z.record(z.string(), z.string()).default({}),
  breaker: CircuitBreakerConfigSchema.default({}),
});
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

export const ProviderRegistryConfigSchema = z.object({
  version: z.literal(1),
  providers: z.array(ProviderEntrySchema),
  fallbackChainMaxLength: z.number().int().min(1).max(10).default(3),
  defaultCostCeilingUsd: z.object({
    video: z.number().positive(),
    image: z.number().positive(),
    tts: z.number().positive(),
    transcription: z.number().positive(),
  }),
});
export type ProviderRegistryConfig = z.infer<typeof ProviderRegistryConfigSchema>;

export const RequiredCapabilitiesSchema = z.object({
  durationSec: z.number().positive().optional(),
  resolution: z.string().optional(),
  lipSync: z.boolean().optional(),
  imageToVideo: z.boolean().optional(),
  nativeAudio: z.boolean().optional(),
  watermarkPolicy: z.array(WatermarkPolicySchema).optional(),
  commercialUse: z.literal(true),
});
export type RequiredCapabilities = z.infer<typeof RequiredCapabilitiesSchema>;

export const RouterCriteriaSchema = z.object({
  kind: ProviderKindSchema,
  workspaceTier: z.string(),
  costCeilingUsd: z.number().positive(),
  required: RequiredCapabilitiesSchema,
  jobShape: z.object({
    durationSec: z.number().positive().optional(),
    imageCount: z.number().int().positive().optional(),
    characters: z.number().int().positive().optional(),
  }),
});
export type RouterCriteria = z.infer<typeof RouterCriteriaSchema>;

export const SelectionResultSchema = z.object({
  providerId: z.string(),
  estimatedCostUsd: z.number().nonnegative(),
  reason: z.string(),
  rank: z.number().int().nonnegative(),
});
export type SelectionResult = z.infer<typeof SelectionResultSchema>;

export const RejectionReasonSchema = z.object({
  providerId: z.string(),
  stage: z.enum(["enabled", "tier", "capability", "compliance", "cost_ceiling", "breaker"]),
  detail: z.string(),
});
export type RejectionReason = z.infer<typeof RejectionReasonSchema>;
