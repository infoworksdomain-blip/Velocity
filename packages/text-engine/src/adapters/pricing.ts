import type { TokenUsage } from "../types.js";

/**
 * [UNVERIFIED FIXTURE — provider-adapter command] Per-million-token rates
 * transcribed from public vendor pricing pages at the time this step was
 * written, not fetched from a live pricing API. Vendor rates change; this
 * table should be reconfirmed against the vendor's actual current pricing
 * before it ever prices a real invoice. What's real: the calculation itself
 * (real token counts from a real API response × a rate table), which is
 * the part GATE 8B's cost claim depends on — see docs/steps/STEP-08B.md.
 */
export interface ModelRateUsdPerMillionTokens {
  input: number;
  output: number;
}

export const MODEL_RATES: Record<string, ModelRateUsdPerMillionTokens> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

export function calculateCostUsd(model: string, usage: TokenUsage): number {
  const rate = MODEL_RATES[model];
  if (!rate) {
    throw new Error(`No rate configured for model "${model}" — add it to MODEL_RATES before routing spend to it`);
  }
  return (usage.inputTokens / 1_000_000) * rate.input + (usage.outputTokens / 1_000_000) * rate.output;
}
