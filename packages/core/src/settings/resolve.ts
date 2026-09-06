import { PLATFORM_DEFAULT_SETTINGS } from "./defaults";

export interface SettingsSources {
  workspaceSettings: Record<string, unknown>;
  organisationSettings: Record<string, unknown>;
}

/**
 * STEP 4's settings resolution order: workspace override -> organisation
 * default -> platform default. `undefined` if no tier has the key at all
 * (distinguishable from a tier explicitly setting the key to `null`).
 */
export function resolveSetting(key: string, sources: SettingsSources): unknown {
  if (key in sources.workspaceSettings) return sources.workspaceSettings[key];
  if (key in sources.organisationSettings) return sources.organisationSettings[key];
  if (key in PLATFORM_DEFAULT_SETTINGS) return PLATFORM_DEFAULT_SETTINGS[key];
  return undefined;
}

/** Resolves every known platform-default key at once, useful for a settings page that shows the effective value per key regardless of which tier it came from. */
export function resolveAllSettings(sources: SettingsSources): Record<string, unknown> {
  const keys = new Set([
    ...Object.keys(PLATFORM_DEFAULT_SETTINGS),
    ...Object.keys(sources.organisationSettings),
    ...Object.keys(sources.workspaceSettings),
  ]);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = resolveSetting(key, sources);
  }
  return result;
}
