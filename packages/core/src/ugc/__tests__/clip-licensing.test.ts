import { describe, expect, it } from "vitest";
import { isClipUsableFor, selectLicensedClip, type LicensedClip } from "../clip-licensing";

function makeClip(overrides: Partial<LicensedClip> = {}): LicensedClip {
  return {
    id: "clip-1",
    releaseRef: "release-doc-1",
    usageTerritory: null,
    usageDurationMonths: null,
    usageMedia: [],
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("isClipUsableFor", () => {
  it("is usable when the clip has no restrictions at all", () => {
    const result = isClipUsableFor(makeClip(), { territory: "UK", media: "paid_social" });
    expect(result.usable).toBe(true);
  });

  it("rejects a clip licensed for a different territory", () => {
    const result = isClipUsableFor(makeClip({ usageTerritory: "UK" }), { territory: "Nigeria", media: "organic" });
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("UK");
  });

  it("matches territory case-insensitively", () => {
    const result = isClipUsableFor(makeClip({ usageTerritory: "UK" }), { territory: "uk", media: "organic" });
    expect(result.usable).toBe(true);
  });

  it("rejects a clip not licensed for the requested media type", () => {
    const result = isClipUsableFor(makeClip({ usageMedia: ["organic"] }), { territory: "UK", media: "paid_social" });
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("organic");
  });

  it("accepts a clip whose usageMedia list includes the requested media", () => {
    const result = isClipUsableFor(makeClip({ usageMedia: ["organic", "paid_social"] }), { territory: "UK", media: "paid_social" });
    expect(result.usable).toBe(true);
  });

  it("rejects a clip whose usage duration has expired", () => {
    const result = isClipUsableFor(
      makeClip({ usageDurationMonths: 6, createdAt: new Date("2026-01-01") }),
      { territory: "UK", media: "organic", asOfDate: new Date("2026-08-01") },
    );
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("accepts a clip still within its usage duration window", () => {
    const result = isClipUsableFor(
      makeClip({ usageDurationMonths: 6, createdAt: new Date("2026-01-01") }),
      { territory: "UK", media: "organic", asOfDate: new Date("2026-03-01") },
    );
    expect(result.usable).toBe(true);
  });
});

describe("selectLicensedClip", () => {
  it("returns the first usable clip from the library", () => {
    const clips = [
      makeClip({ id: "clip-a", usageTerritory: "Nigeria" }),
      makeClip({ id: "clip-b", usageTerritory: "UK" }),
    ];
    const selected = selectLicensedClip(clips, { territory: "UK", media: "organic" });
    expect(selected?.id).toBe("clip-b");
  });

  it("returns null when no clip in the library resolves to a usable licence for the requested context", () => {
    const clips = [makeClip({ id: "clip-a", usageTerritory: "Nigeria" })];
    const selected = selectLicensedClip(clips, { territory: "UK", media: "organic" });
    expect(selected).toBeNull();
  });

  it("returns null for an empty library (every clip must resolve to a licence record — there is no unlicensed fallback)", () => {
    expect(selectLicensedClip([], { territory: "UK", media: "organic" })).toBeNull();
  });
});
