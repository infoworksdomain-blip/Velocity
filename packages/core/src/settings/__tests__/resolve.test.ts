import { describe, expect, it } from "vitest";
import { PLATFORM_DEFAULT_SETTINGS } from "../defaults";
import { resolveAllSettings, resolveSetting } from "../resolve";

describe("settings resolution order (workspace -> organisation -> platform)", () => {
  it("prefers a workspace override over everything else", () => {
    const value = resolveSetting("calendar.weekStartsOn", {
      workspaceSettings: { "calendar.weekStartsOn": "sunday" },
      organisationSettings: { "calendar.weekStartsOn": "monday" },
    });
    expect(value).toBe("sunday");
  });

  it("falls back to the organisation default when the workspace has no override", () => {
    const value = resolveSetting("calendar.weekStartsOn", {
      workspaceSettings: {},
      organisationSettings: { "calendar.weekStartsOn": "monday" },
    });
    expect(value).toBe("monday");
  });

  it("falls back to the platform default when neither tier has set it", () => {
    const value = resolveSetting("notifications.emailDigest", {
      workspaceSettings: {},
      organisationSettings: {},
    });
    expect(value).toBe(PLATFORM_DEFAULT_SETTINGS["notifications.emailDigest"]);
  });

  it("returns undefined for a key no tier knows about", () => {
    const value = resolveSetting("not.a.real.key", { workspaceSettings: {}, organisationSettings: {} });
    expect(value).toBeUndefined();
  });

  it("distinguishes an explicit null override from an unset key", () => {
    const value = resolveSetting("branding.showPoweredBy", {
      workspaceSettings: { "branding.showPoweredBy": null },
      organisationSettings: {},
    });
    expect(value).toBeNull(); // not the platform default (true) — the workspace explicitly set it to null
  });

  it("resolveAllSettings merges every known key across all three tiers", () => {
    const all = resolveAllSettings({
      workspaceSettings: { "calendar.weekStartsOn": "sunday" },
      organisationSettings: { "org.only.key": "org-value" },
    });
    expect(all["calendar.weekStartsOn"]).toBe("sunday");
    expect(all["org.only.key"]).toBe("org-value");
    expect(all["notifications.emailDigest"]).toBe(PLATFORM_DEFAULT_SETTINGS["notifications.emailDigest"]);
  });
});
