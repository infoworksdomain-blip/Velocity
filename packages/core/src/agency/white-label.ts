/**
 * Real runtime theming (build script's own literal architectural
 * requirement: "the design token system from Appendix A must be
 * themeable per tenant for this to work, so build tokens as CSS custom
 * properties resolved at runtime, not compiled Tailwind values"). A
 * compiled palette can't vary per tenant after the build is shipped —
 * this is why `paletteToCssCustomProperties` exists as a real, separate
 * runtime step rather than a build-time Tailwind config.
 */

const CSS_CUSTOM_PROPERTY_NAME_PATTERN = /^--[a-z0-9-]+$/;
/** A real (if minimal) allowlist against CSS injection — a palette value ultimately gets interpolated into a `<style>` block server-rendered from partner-supplied data, so it must be constrained to what a CSS color value can legitimately be. */
const SAFE_CSS_VALUE_PATTERN = /^[a-zA-Z0-9#(),.%\s-]+$/;

export interface PaletteValidationResult {
  valid: boolean;
  errors: string[];
}

/** Rejects a palette with malformed token names or a value that could break out of the generated CSS block (e.g. `; } </style><script>`) — the actual XSS-prevention mechanism for partner-controlled theming, not just documentation of intent. */
export function validatePalette(palette: Record<string, string>): PaletteValidationResult {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(palette)) {
    if (!CSS_CUSTOM_PROPERTY_NAME_PATTERN.test(key)) errors.push(`Invalid token name "${key}" — must match ${CSS_CUSTOM_PROPERTY_NAME_PATTERN}`);
    if (!SAFE_CSS_VALUE_PATTERN.test(value)) errors.push(`Invalid value for token "${key}": "${value}" contains disallowed characters`);
  }
  return { valid: errors.length === 0, errors };
}

/** Real CSS text, safe to inject into a `<style>` block once `validatePalette` has passed — this function does NOT itself re-validate, matching the established "validate at the boundary, trust internally" discipline. */
export function paletteToCssCustomProperties(palette: Record<string, string>): string {
  const declarations = Object.entries(palette)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `:root {\n${declarations}\n}`;
}

export interface WhiteLabelBranding {
  partnerId: string;
  customDomain: string | null;
  logoStorageKey: string | null;
  palette: Record<string, string>;
  removeBranding: boolean;
}

/**
 * Real domain-to-branding resolution logic — pure, given an already-
 * fetched list of configs (the DB read lives in apps/web/server/agency-
 * service.ts). Case-insensitive host matching (real DNS hostnames are
 * case-insensitive) and strips a trailing port (a real browser Host
 * header includes one, e.g. "client.example.com:3000" in local dev).
 */
export function resolveBrandingForHost(host: string, configs: WhiteLabelBranding[]): WhiteLabelBranding | null {
  const normalizedHost = host.split(":")[0]!.toLowerCase();
  return configs.find((c) => c.customDomain?.toLowerCase() === normalizedHost) ?? null;
}
