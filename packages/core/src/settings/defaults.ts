/**
 * The innermost fallback tier — platform defaults live in code, not the
 * database, since they apply when neither a workspace nor its organisation
 * has ever set a value. Keys here are illustrative of the kinds of
 * settings later steps read through this resolver (notification
 * preferences, posting defaults) — add to this as those steps need it,
 * rather than pre-guessing every future setting now.
 */
export const PLATFORM_DEFAULT_SETTINGS: Record<string, unknown> = {
  "notifications.emailDigest": "daily",
  "calendar.weekStartsOn": "monday",
  "branding.showPoweredBy": true,
};
