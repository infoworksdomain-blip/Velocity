import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * STEP 18 fraud/risk signals (build script: "fraud/risk: velocity checks,
 * disposable email detection, multi-account patterns"). Same honest-seed-
 * list discipline as public-figure-check.ts (STEP 15): a real,
 * configurable domain-matching mechanism against a small, illustrative
 * seed list (config/disposable-email-domains.json), not a comprehensive
 * or maintained block list -- a production system needs a subscribed
 * disposable-domain feed. Multi-account detection is a real but limited
 * signal: this sandbox has no IP/device-fingerprint infrastructure, so it
 * can only reason from email-normalization patterns (Gmail-style dot/
 * plus-tag aliasing), which is a genuine, if narrow, signal -- two emails
 * that normalize to the same identity really are evidence of one person
 * controlling both accounts, but the absence of a match proves nothing.
 */

export const DisposableEmailDomainsConfigSchema = z.object({
  version: z.literal(1),
  domains: z.array(z.string().min(1)),
  note: z.string(),
});
export type DisposableEmailDomainsConfig = z.infer<typeof DisposableEmailDomainsConfigSchema>;

let cachedConfig: DisposableEmailDomainsConfig | null = null;

export function loadDisposableEmailDomainsConfig(absolutePath: string): DisposableEmailDomainsConfig {
  if (cachedConfig) return cachedConfig;
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8"));
  cachedConfig = DisposableEmailDomainsConfigSchema.parse(raw);
  return cachedConfig;
}

export function resetDisposableEmailDomainsConfigForTests(): void {
  cachedConfig = null;
}

export function isDisposableEmailDomain(email: string, config: DisposableEmailDomainsConfig): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return config.domains.includes(domain);
}

/**
 * Normalizes an email for identity comparison. The `+tag` convention
 * (RFC 5233 sub-addressing) is honoured near-universally across major
 * providers, so it's stripped regardless of domain. Dot-folding in the
 * local part is Gmail/Google-Workspace-specific behaviour -- assuming
 * other providers ignore dots too would create false positives -- so
 * that part only applies to gmail.com/googlemail.com, which are also
 * folded onto one canonical domain.
 */
export function normalizeEmailForIdentity(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return trimmed;

  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  const withoutTag = local.split("+")[0] ?? local;
  const normalizedLocal = isGmail ? withoutTag.replace(/\./g, "") : withoutTag;
  const normalizedDomain = isGmail ? "gmail.com" : domain;
  return `${normalizedLocal}@${normalizedDomain}`;
}

export interface MultiAccountSignal {
  detected: boolean;
  normalizedIdentity: string;
  matchingEmails: string[];
}

/** Checks a candidate email against a list of already-registered emails for the same normalized identity. */
export function detectMultiAccountSignal(candidateEmail: string, existingEmails: readonly string[]): MultiAccountSignal {
  const normalized = normalizeEmailForIdentity(candidateEmail);
  const matches = existingEmails.filter((existing) => normalizeEmailForIdentity(existing) === normalized);
  return { detected: matches.length > 0, normalizedIdentity: normalized, matchingEmails: matches };
}
