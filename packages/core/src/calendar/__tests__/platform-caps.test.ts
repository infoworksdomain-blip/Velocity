import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { capFor, loadPlatformCapsConfig, PlatformCapsConfigSchema, resetPlatformCapsConfigForTests } from "../platform-caps.js";

const REAL_CONFIG_PATH = fileURLToPath(new URL("../../../../../config/platform-caps.json", import.meta.url));

describe("config/platform-caps.json", () => {
  it("is valid against the schema", () => {
    const raw = JSON.parse(readFileSync(REAL_CONFIG_PATH, "utf-8"));
    expect(() => PlatformCapsConfigSchema.parse(raw)).not.toThrow();
  });

  it("loads and caches, and capFor resolves a real platform", () => {
    resetPlatformCapsConfigForTests();
    const config = loadPlatformCapsConfig(REAL_CONFIG_PATH);
    const cap = capFor(config, "tiktok");
    expect(cap.postsPerRollingWindow).toBeGreaterThan(0);
    expect(cap.windowHours).toBe(24);
  });

  it("capFor throws for an unconfigured platform rather than silently allowing unlimited posting", () => {
    resetPlatformCapsConfigForTests();
    const config = loadPlatformCapsConfig(REAL_CONFIG_PATH);
    expect(() => capFor(config, "not_a_real_platform")).toThrow();
  });
});
