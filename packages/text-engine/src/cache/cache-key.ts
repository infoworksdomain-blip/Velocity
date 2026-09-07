import { createHash } from "node:crypto";

/**
 * Build script 8B.4: "Cache key: hash(brand_profile_version + angle_id +
 * format + blueprint_id + platform). A cache hit costs nothing and is the
 * difference between a viable and non-viable Blitz queue." A missing
 * `blueprintId` (a concept with no matched trend blueprint) is a real,
 * valid input, not an error — it's included as the literal string "none"
 * so it still participates in the hash rather than being silently dropped.
 */
export interface TextPlanCacheKeyInput {
  brandProfileVersion: number;
  angleId: string;
  format: string;
  blueprintId: string | null;
  platform: string;
}

export function computeTextPlanCacheKey(input: TextPlanCacheKeyInput): string {
  const raw = [input.brandProfileVersion, input.angleId, input.format, input.blueprintId ?? "none", input.platform].join("|");
  return createHash("sha256").update(raw).digest("hex");
}
