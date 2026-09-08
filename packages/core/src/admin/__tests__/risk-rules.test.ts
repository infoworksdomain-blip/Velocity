import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  detectMultiAccountSignal,
  type DisposableEmailDomainsConfig,
  isDisposableEmailDomain,
  loadDisposableEmailDomainsConfig,
  normalizeEmailForIdentity,
  resetDisposableEmailDomainsConfigForTests,
} from "../risk-rules";

const CONFIG_PATH = fileURLToPath(new URL("../../../../../config/disposable-email-domains.json", import.meta.url));

describe("loadDisposableEmailDomainsConfig", () => {
  beforeEach(() => resetDisposableEmailDomainsConfigForTests());

  it("loads and validates the real config file", () => {
    const config = loadDisposableEmailDomainsConfig(CONFIG_PATH);
    expect(config.version).toBe(1);
    expect(config.domains.length).toBeGreaterThan(0);
    expect(config.domains).toContain("mailinator.com");
  });

  it("caches after the first load", () => {
    const first = loadDisposableEmailDomainsConfig(CONFIG_PATH);
    const second = loadDisposableEmailDomainsConfig("/nonexistent/path.json");
    expect(second).toBe(first);
  });
});

describe("isDisposableEmailDomain", () => {
  const config: DisposableEmailDomainsConfig = { version: 1, domains: ["mailinator.com", "tempmail.com"], note: "test" };

  it("flags a listed domain, case-insensitively", () => {
    expect(isDisposableEmailDomain("user@Mailinator.com", config)).toBe(true);
  });

  it("does not flag a domain not on the list", () => {
    expect(isDisposableEmailDomain("user@gmail.com", config)).toBe(false);
  });

  it("returns false for a malformed address with no domain", () => {
    expect(isDisposableEmailDomain("not-an-email", config)).toBe(false);
  });
});

describe("normalizeEmailForIdentity", () => {
  it("strips dots and +tags from Gmail addresses", () => {
    expect(normalizeEmailForIdentity("a.b.c+work@gmail.com")).toBe("abc@gmail.com");
  });

  it("treats googlemail.com as gmail.com", () => {
    expect(normalizeEmailForIdentity("a.b@googlemail.com")).toBe("ab@gmail.com");
  });

  it("leaves non-Gmail domains' dots untouched (real per-provider limitation)", () => {
    expect(normalizeEmailForIdentity("a.b@example.com")).toBe("a.b@example.com");
  });

  it("still strips +tags and lowercases non-Gmail domains", () => {
    expect(normalizeEmailForIdentity("User+promo@Example.com")).toBe("user@example.com");
  });
});

describe("detectMultiAccountSignal", () => {
  it("detects a Gmail dot/plus-tag alias of an already-registered address", () => {
    const result = detectMultiAccountSignal("a.b+new@gmail.com", ["ab@gmail.com", "someone-else@example.com"]);
    expect(result.detected).toBe(true);
    expect(result.matchingEmails).toEqual(["ab@gmail.com"]);
  });

  it("reports no signal when no existing email normalizes to the same identity", () => {
    const result = detectMultiAccountSignal("fresh@gmail.com", ["ab@gmail.com"]);
    expect(result.detected).toBe(false);
    expect(result.matchingEmails).toEqual([]);
  });
});
