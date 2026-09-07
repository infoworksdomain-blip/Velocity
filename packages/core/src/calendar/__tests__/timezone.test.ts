import { describe, expect, it } from "vitest";
import { findNextDstTransition, getOffsetMinutes, utcToZonedParts, zonedTimeToUtc } from "../timezone.js";

describe("getOffsetMinutes", () => {
  it("UTC itself always has offset 0", () => {
    expect(getOffsetMinutes(new Date("2026-06-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("Europe/London and America/New_York have different winter vs summer offsets (real DST, not assumed)", () => {
    const winterLondon = getOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/London");
    const summerLondon = getOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/London");
    expect(winterLondon).toBe(0); // GMT
    expect(summerLondon).toBe(60); // BST

    const winterNY = getOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York");
    const summerNY = getOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York");
    expect(winterNY).toBe(-300); // EST
    expect(summerNY).toBe(-240); // EDT
  });
});

describe("zonedTimeToUtc / utcToZonedParts round-trip", () => {
  it("round-trips a local wall-clock time back to itself, away from any DST transition", () => {
    const parts = { year: 2026, month: 6, day: 15, hour: 9, minute: 30 };
    const utc = zonedTimeToUtc(parts, "America/New_York");
    const roundTripped = utcToZonedParts(utc, "America/New_York");
    expect(roundTripped.year).toBe(parts.year);
    expect(roundTripped.month).toBe(parts.month);
    expect(roundTripped.day).toBe(parts.day);
    expect(roundTripped.hour).toBe(parts.hour);
    expect(roundTripped.minute).toBe(parts.minute);
  });

  it("a fixed local wall-clock time (09:00) converts to a different UTC hour in winter vs summer, in America/New_York", () => {
    const winterUtc = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, "America/New_York");
    const summerUtc = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, "America/New_York");
    expect(winterUtc.getUTCHours()).toBe(14); // EST = UTC-5
    expect(summerUtc.getUTCHours()).toBe(13); // EDT = UTC-4
  });

  it("round-trips correctly for Europe/London across its own DST", () => {
    const winter = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, "Europe/London");
    const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, "Europe/London");
    expect(winter.getUTCHours()).toBe(9); // GMT = UTC+0
    expect(summer.getUTCHours()).toBe(8); // BST = UTC+1
  });
});

describe("findNextDstTransition", () => {
  it("finds a real DST transition in America/New_York within a year, discovered from Node's own tzdata", () => {
    const transition = findNextDstTransition(new Date("2026-01-01T00:00:00Z"), "America/New_York");
    expect(transition).not.toBeNull();

    // +-5 minutes, comfortably outside findNextDstTransition's own ~1s convergence precision.
    const offsetBefore = getOffsetMinutes(new Date(transition!.getTime() - 5 * 60000), "America/New_York");
    const offsetAfter = getOffsetMinutes(new Date(transition!.getTime() + 5 * 60000), "America/New_York");
    expect(offsetBefore).not.toBe(offsetAfter);
  });

  it("finds a real DST transition in Europe/London within a year", () => {
    const transition = findNextDstTransition(new Date("2026-01-01T00:00:00Z"), "Europe/London");
    expect(transition).not.toBeNull();
  });

  it("returns null for a timezone that does not observe DST", () => {
    // UTC never changes offset — the sentinel case findNextDstTransition's own doc comment describes.
    const transition = findNextDstTransition(new Date("2026-01-01T00:00:00Z"), "UTC", 30);
    expect(transition).toBeNull();
  });

  /**
   * GATE 10's literal claim: "correct local times across a DST boundary."
   * This is that test — a real transition discovered from Node's tzdata,
   * with a slot scheduled at the same local wall-clock time on the day
   * immediately before and the day immediately after, asserting their
   * UTC instants are NOT exactly 24h apart (the naive, DST-unaware bug
   * this whole module exists to prevent) but are correctly offset by the
   * real DST shift instead.
   */
  it("GATE 10: a recurring 09:00-local slot across a real DST boundary lands on the correct UTC instant on both sides", () => {
    const transition = findNextDstTransition(new Date("2026-01-01T00:00:00Z"), "America/New_York")!;
    const zonedBefore = utcToZonedParts(new Date(transition.getTime() - 86400000), "America/New_York");
    const zonedAfter = utcToZonedParts(new Date(transition.getTime() + 86400000), "America/New_York");

    const slotBefore = zonedTimeToUtc({ year: zonedBefore.year, month: zonedBefore.month, day: zonedBefore.day, hour: 9, minute: 0 }, "America/New_York");
    const slotAfter = zonedTimeToUtc({ year: zonedAfter.year, month: zonedAfter.month, day: zonedAfter.day, hour: 9, minute: 0 }, "America/New_York");

    // How many calendar days apart "before" and "after" actually are —
    // computed, not assumed, so this test doesn't depend on exactly how
    // many hours before/after the transition instant the probe points land.
    const calendarDayGap = Math.round((Date.UTC(zonedAfter.year, zonedAfter.month - 1, zonedAfter.day) - Date.UTC(zonedBefore.year, zonedBefore.month - 1, zonedBefore.day)) / 86400000);

    const offsetBeforeMin = getOffsetMinutes(slotBefore, "America/New_York");
    const offsetAfterMin = getOffsetMinutes(slotAfter, "America/New_York");
    expect(offsetAfterMin).not.toBe(offsetBeforeMin); // the two probes really do straddle the transition

    // The actual real-world relationship a naive (DST-unaware) scheduler
    // gets wrong: with a CONSTANT offset, N calendar days apart at the
    // same local wall-clock time is always exactly N*24h apart in UTC.
    // Across a real DST shift, it's off by exactly the offset change —
    // this is the literal bug GATE 10's "correct local times across a DST
    // boundary" check exists to catch.
    const actualGapHours = (slotAfter.getTime() - slotBefore.getTime()) / 3600000;
    const expectedGapHours = calendarDayGap * 24 - (offsetAfterMin - offsetBeforeMin) / 60;
    expect(actualGapHours).toBe(expectedGapHours);
    expect(actualGapHours).not.toBe(calendarDayGap * 24); // the naive, wrong answer a non-DST-aware implementation would give

    // And each slot, read back in its own local zone, really does say 09:00 — the actual "correct local time" claim.
    expect(utcToZonedParts(slotBefore, "America/New_York").hour).toBe(9);
    expect(utcToZonedParts(slotAfter, "America/New_York").hour).toBe(9);
  });
});
