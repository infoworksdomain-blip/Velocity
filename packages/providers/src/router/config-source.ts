import { readFileSync } from "node:fs";
import { ProviderRegistryConfigSchema, type ProviderRegistryConfig } from "@velocity/contracts";

/**
 * Where the provider registry's config comes from (ADR 0004: "adapter
 * registration and routing weights live in config, not in code"). File-
 * backed now — a DB-backed source lands in STEP 18 alongside the 60-second
 * kill switch, behind this same interface, so nothing above this layer
 * needs to change when that happens.
 */
export interface ProviderConfigSource {
  load(): Promise<ProviderRegistryConfig>;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/** Replaces `${ENV_VAR}` placeholders in every string value of the parsed config with the real environment variable — credentials never live in the config file itself. */
function interpolateEnv(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_VAR_PATTERN, (_match, varName: string) => process.env[varName] ?? "");
  }
  if (Array.isArray(value)) return value.map(interpolateEnv);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateEnv(v)]));
  }
  return value;
}

export class FileProviderConfigSource implements ProviderConfigSource {
  constructor(private readonly path: string = process.env.VELOCITY_PROVIDERS_CONFIG ?? "config/providers.json") {}

  async load(): Promise<ProviderRegistryConfig> {
    const raw = readFileSync(this.path, "utf8");
    const parsed: unknown = interpolateEnv(JSON.parse(raw));
    return ProviderRegistryConfigSchema.parse(parsed);
  }
}

/** Test/fixture source — no filesystem, no env interpolation surprises. */
export class StaticProviderConfigSource implements ProviderConfigSource {
  constructor(private readonly config: ProviderRegistryConfig) {}

  async load(): Promise<ProviderRegistryConfig> {
    return this.config;
  }
}
