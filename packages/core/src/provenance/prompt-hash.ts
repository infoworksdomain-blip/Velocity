import { createHash } from "node:crypto";

/** Canonical JSON so key order never affects the hash — the same logical prompt always hashes the same, and any change to storyboard/text plan/persona is detectable. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export interface PromptHashInput {
  storyboard: unknown;
  textPlanId: string | null;
  personaId: string | null;
  format: string;
}

/** `renders.promptHash` (C2) — recorded at resolveAssets time, before any provider call. */
export function promptHash(input: PromptHashInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}
