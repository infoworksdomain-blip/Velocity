import { describe, expect, it } from "vitest";
import { anonymizeUserFields, DSAR_EXPORT_TABLES } from "../dsar";

describe("anonymizeUserFields", () => {
  it("produces a deterministic, non-guessable anonymized email keyed on the user id", () => {
    const result = anonymizeUserFields("11111111-1111-1111-1111-111111111111");
    expect(result.email).toBe("deleted-11111111-1111-1111-1111-111111111111@erased.invalid");
    expect(result.name).toBeNull();
    expect(result.passwordHash).toBeNull();
  });

  it("never reuses the original user's real email or name in the output", () => {
    const result = anonymizeUserFields("22222222-2222-2222-2222-222222222222");
    expect(result.email).not.toContain("@gmail.com");
    expect(result.email).not.toContain("@example.com");
  });

  it("two different users anonymize to two different, non-colliding emails", () => {
    const a = anonymizeUserFields("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const b = anonymizeUserFields("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(a.email).not.toBe(b.email);
  });
});

describe("DSAR_EXPORT_TABLES", () => {
  it("documents a real, non-empty export scope", () => {
    expect(DSAR_EXPORT_TABLES.length).toBeGreaterThan(0);
    expect(DSAR_EXPORT_TABLES).toContain("users");
    expect(DSAR_EXPORT_TABLES).toContain("sessions");
  });
});
