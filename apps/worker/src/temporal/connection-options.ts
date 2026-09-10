/**
 * Shared connection-option resolution for both @temporalio/client
 * (apps/web triggering workflows, and this package's own client.ts) and
 * @temporalio/worker (worker.ts's NativeConnection). Temporal Cloud
 * requires TLS and an API key; local/self-hosted Temporal (the default
 * this codebase has used since STEP 8) is plaintext on localhost:7233.
 * Driven entirely by env vars so no code path changes between the two —
 * same DI-via-env-var discipline as every other vendor credential in this
 * build (Stripe, Resend, etc.).
 */
export interface TemporalConnectionOptions {
  address: string;
  tls?: true;
  apiKey?: string;
}

export function resolveTemporalConnectionOptions(): TemporalConnectionOptions {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const apiKey = process.env.TEMPORAL_API_KEY;
  if (!apiKey) return { address };
  return { address, tls: true, apiKey };
}

export function resolveTemporalNamespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}
