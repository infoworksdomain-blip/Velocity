import { describe, expect, it } from "vitest";
import { autoFillCalendar, type AutoFillAccount, type AutoFillContentItem, type AutoFillInput } from "../auto-fill.js";
import { findNextDstTransition, utcToZonedParts } from "../timezone.js";
import type { PlatformCapsConfig } from "../platform-caps.js";

const CAPS: PlatformCapsConfig = {
  version: 1,
  defaultMinSpacingMinutes: 15,
  caps: {
    tiktok: { postsPerRollingWindow: 15, windowHours: 24, minSpacingMinutes: 15, note: "" },
    instagram: { postsPerRollingWindow: 100, windowHours: 24, minSpacingMinutes: 15, note: "" },
    youtube: { postsPerRollingWindow: 100, windowHours: 24, minSpacingMinutes: 15, note: "" },
  },
};

function makeAccounts(): AutoFillAccount[] {
  return [
    { socialAccountId: "acct-tiktok-1", platform: "tiktok" },
    { socialAccountId: "acct-tiktok-2", platform: "tiktok" },
    { socialAccountId: "acct-instagram-1", platform: "instagram" },
    { socialAccountId: "acct-instagram-2", platform: "instagram" },
    { socialAccountId: "acct-youtube-1", platform: "youtube" },
  ];
}

const FORMATS = ["ai_ugc", "slideshow", "hook_demo", "meme"];
const ANGLES = ["pain_led", "transformation", "comparison", "pov"];
const HOOK_PATTERNS = ["curiosity_gap", "contrarian", "pov", "callout"];

function makeContentPool(count: number): AutoFillContentItem[] {
  return Array.from({ length: count }, (_, i) => ({
    contentItemId: `item-${i}`,
    format: FORMATS[i % FORMATS.length]!,
    angleKind: ANGLES[i % ANGLES.length]!,
    hookPattern: HOOK_PATTERNS[i % HOOK_PATTERNS.length]!,
    campaignId: null,
  }));
}

describe("GATE 10: 30-day auto-fill across 3 platforms and 5 accounts", () => {
  it("yields zero cap violations and zero double-bookings", () => {
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 30,
      accounts: makeAccounts(),
      contentPool: makeContentPool(500), // generously large so the pool is never the limiting factor for this check
      existingSlots: [],
      campaignWindows: [],
      platformCaps: CAPS,
    };

    const result = autoFillCalendar(input);
    expect(result.assignments.length).toBeGreaterThan(0);

    // Zero cap violations: re-derive, from the OUTPUT alone, that no
    // account ever has more posts in any rolling window than its cap
    // allows — checked against the actual assignments, not just trusted
    // from the algorithm's own internal bookkeeping.
    const byAccount = new Map<string, Date[]>();
    for (const a of result.assignments) {
      const list = byAccount.get(a.socialAccountId) ?? [];
      list.push(a.scheduledAtUtc);
      byAccount.set(a.socialAccountId, list);
    }
    for (const account of input.accounts) {
      const cap = CAPS.caps[account.platform]!;
      const times = (byAccount.get(account.socialAccountId) ?? []).sort((a, b) => a.getTime() - b.getTime());
      for (const t of times) {
        const windowStart = t.getTime() - cap.windowHours * 3600000;
        const countInWindow = times.filter((other) => other.getTime() > windowStart && other.getTime() <= t.getTime()).length;
        expect(countInWindow).toBeLessThanOrEqual(cap.postsPerRollingWindow);
      }
    }

    // Zero double-bookings: no two assignments share BOTH the same
    // account and the same exact UTC instant.
    const seen = new Set<string>();
    for (const a of result.assignments) {
      const key = `${a.socialAccountId}|${a.scheduledAtUtc.toISOString()}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("never assigns a campaign-bound item outside its campaign window", () => {
    const boundItem: AutoFillContentItem = { contentItemId: "campaign-item", format: "meme", angleKind: "pov", hookPattern: "callout", campaignId: "camp-1" };
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 10,
      accounts: [{ socialAccountId: "acct-1", platform: "tiktok" }],
      contentPool: [boundItem, ...makeContentPool(50)],
      existingSlots: [],
      campaignWindows: [{ campaignId: "camp-1", startsAt: new Date("2026-01-05T00:00:00Z"), endsAt: new Date("2026-01-06T00:00:00Z") }],
      platformCaps: CAPS,
    };

    const result = autoFillCalendar(input);
    const assigned = result.assignments.find((a) => a.contentItemId === "campaign-item");
    if (assigned) {
      expect(assigned.scheduledAtUtc.getTime()).toBeGreaterThanOrEqual(new Date("2026-01-05T00:00:00Z").getTime());
      expect(assigned.scheduledAtUtc.getTime()).toBeLessThanOrEqual(new Date("2026-01-06T00:00:00Z").getTime());
    }
  });

  it("a campaign-bound item with no matching campaign window is never assigned (fails closed)", () => {
    const orphanItem: AutoFillContentItem = { contentItemId: "orphan", format: "meme", angleKind: "pov", hookPattern: "callout", campaignId: "camp-does-not-exist" };
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 5,
      accounts: [{ socialAccountId: "acct-1", platform: "tiktok" }],
      contentPool: [orphanItem],
      existingSlots: [],
      campaignWindows: [],
      platformCaps: CAPS,
    };
    const result = autoFillCalendar(input);
    expect(result.assignments.find((a) => a.contentItemId === "orphan")).toBeUndefined();
  });

  it("never repeats the same format on two consecutive slots for the same account, when the pool allows it", () => {
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 20,
      accounts: [{ socialAccountId: "acct-1", platform: "tiktok" }],
      contentPool: makeContentPool(200),
      existingSlots: [],
      campaignWindows: [],
      platformCaps: CAPS,
    };
    const result = autoFillCalendar(input);
    const onAccount = result.assignments.filter((a) => a.socialAccountId === "acct-1").sort((a, b) => a.scheduledAtUtc.getTime() - b.scheduledAtUtc.getTime());
    const formatById = new Map(input.contentPool.map((i) => [i.contentItemId, i.format]));
    for (let i = 1; i < onAccount.length; i++) {
      expect(formatById.get(onAccount[i]!.contentItemId)).not.toBe(formatById.get(onAccount[i - 1]!.contentItemId));
    }
  });

  it("respects min spacing — no two assignments on the same account land within minSpacingMinutes of each other", () => {
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 15,
      accounts: [{ socialAccountId: "acct-1", platform: "tiktok" }],
      contentPool: makeContentPool(100),
      existingSlots: [],
      campaignWindows: [],
      platformCaps: CAPS,
    };
    const result = autoFillCalendar(input);
    const onAccount = result.assignments.filter((a) => a.socialAccountId === "acct-1").map((a) => a.scheduledAtUtc.getTime()).sort((a, b) => a - b);
    for (let i = 1; i < onAccount.length; i++) {
      expect(onAccount[i]! - onAccount[i - 1]!).toBeGreaterThanOrEqual(CAPS.caps.tiktok!.minSpacingMinutes * 60000);
    }
  });

  it("respects a hard cap — reducing postsPerRollingWindow to 1 leaves every slot after the first in a 24h window unfilled for cap_breach, not silently over-booked", () => {
    const tightCaps: PlatformCapsConfig = { version: 1, defaultMinSpacingMinutes: 15, caps: { tiktok: { postsPerRollingWindow: 1, windowHours: 24, minSpacingMinutes: 15, note: "" } } };
    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: 2026, month: 1, day: 1 },
      days: 5,
      accounts: [{ socialAccountId: "acct-1", platform: "tiktok" }],
      contentPool: makeContentPool(50),
      existingSlots: [],
      campaignWindows: [],
      platformCaps: tightCaps,
    };
    const result = autoFillCalendar(input);
    // 3 best-time slots/day for tiktok, cap=1/day -> exactly 1 assignment per day, the rest unfilled for cap_breach.
    const onAccount = result.assignments.filter((a) => a.socialAccountId === "acct-1");
    const daysCovered = new Set(onAccount.map((a) => utcToZonedParts(a.scheduledAtUtc, "Europe/London").day)).size;
    expect(onAccount.length).toBe(daysCovered); // never more than 1 assignment per distinct local day
    expect(result.unfilled.some((u) => u.reason === "cap_breach")).toBe(true);
  });

  /**
   * GATE 10's literal claim: "correct local times across a DST boundary."
   * Runs a real 30-day fill straddling the UK's actual spring-forward
   * transition (discovered from Node's own tzdata, not a hardcoded date)
   * and asserts every assigned slot, read back in Europe/London, lands on
   * the exact intended local hour:minute — proving the auto-fill's own
   * scheduling, not just the underlying timezone module in isolation, is
   * DST-correct end to end.
   */
  it("produces correct local times across a real DST boundary (Europe/London)", () => {
    const transition = findNextDstTransition(new Date("2026-01-01T00:00:00Z"), "Europe/London")!;
    const startZoned = utcToZonedParts(new Date(transition.getTime() - 5 * 86400000), "Europe/London");

    const input: AutoFillInput = {
      workspaceTimezone: "Europe/London",
      startDate: { year: startZoned.year, month: startZoned.month, day: startZoned.day },
      days: 10, // straddles the transition
      accounts: [{ socialAccountId: "acct-1", platform: "instagram" }], // instagram's generous cap keeps every slot fillable
      contentPool: makeContentPool(100),
      existingSlots: [],
      campaignWindows: [],
      platformCaps: CAPS,
    };

    const result = autoFillCalendar(input);
    expect(result.assignments.length).toBeGreaterThan(0);

    const expectedTimes = new Set(["11:00", "13:00", "19:00"]); // instagram's DEFAULT_BEST_TIMES
    for (const assignment of result.assignments) {
      const zoned = utcToZonedParts(assignment.scheduledAtUtc, "Europe/London");
      const hm = `${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`;
      expect(expectedTimes.has(hm)).toBe(true);
    }

    // The actual DST-crossing proof: offsets before and after the
    // transition genuinely differ among the assigned slots (confirming
    // the fill really did span the boundary, not just claim to).
    const offsetsSeen = new Set(result.assignments.map((a) => a.scheduledAtUtc.getUTCHours() - Number(utcToZonedParts(a.scheduledAtUtc, "Europe/London").hour)));
    expect(offsetsSeen.size).toBeGreaterThan(1);
  });
});
