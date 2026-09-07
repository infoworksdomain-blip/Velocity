/**
 * Real IANA-timezone-aware local <-> UTC conversion (STEP 10, GATE 10:
 * "correct local times across a DST boundary"). Deliberately no
 * date-fns-tz/luxon/moment-timezone dependency — Node's built-in `Intl`
 * API ships real tzdata and can do this correctly on its own; adding a
 * library here would duplicate data Node already has right.
 */

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

/**
 * The offset (in minutes, positive east of UTC) a given UTC instant has
 * when displayed in `timeZone` — e.g. +60 for Europe/London in BST, -300
 * for America/New_York in EST. Computed by asking Intl what wall-clock
 * time this UTC instant displays as in that zone, then comparing.
 */
export function getOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  // Intl reports hour "24" for midnight under hourCycle h23 in some environments — normalize.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  // Real IANA timezone offsets are always a whole number of minutes.
  // `parts.second` only carries whole seconds (Intl.formatToParts's
  // integer field), while `utcDate.getTime()` keeps full millisecond
  // precision — for an input with non-zero milliseconds/fractional
  // seconds, the raw difference below picks up a spurious sub-minute
  // remainder (e.g. -240.00833... instead of -240). Found for real: it
  // broke findNextDstTransition's binary search, whose strict `===`
  // offset comparison started treating a bisection midpoint with
  // fractional milliseconds as "still the old offset" purely from this
  // rounding noise, corrupting the search entirely. Rounding here is
  // exact, not a fudge — the true offset genuinely is a whole minute.
  return Math.round((asIfUtc - utcDate.getTime()) / 60000);
}

/**
 * Converts a LOCAL wall-clock time in `timeZone` to the UTC instant it
 * represents. Two-iteration fixed point (the standard technique real
 * timezone libraries use): a naive guess treating the wall-clock numbers
 * as UTC gets the offset close enough to correct against, then one more
 * offset lookup at the corrected instant catches the rare case where the
 * naive guess landed on the wrong side of a DST transition.
 */
export function zonedTimeToUtc(parts: ZonedDateParts, timeZone: string): Date {
  const naiveUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second ?? 0);
  const offset1 = getOffsetMinutes(new Date(naiveUtcMs), timeZone);
  const corrected1Ms = naiveUtcMs - offset1 * 60000;
  const offset2 = getOffsetMinutes(new Date(corrected1Ms), timeZone);
  const finalMs = offset2 === offset1 ? corrected1Ms : naiveUtcMs - offset2 * 60000;
  return new Date(finalMs);
}

/** The inverse: what local wall-clock date/time a UTC instant displays as in `timeZone`. */
export function utcToZonedParts(utcDate: Date, timeZone: string): ZonedDateParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(utcDate).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour, minute: Number(parts.minute), second: Number(parts.second) };
}

/**
 * Scans forward day-by-day from `fromUtc` (up to `maxDays`) for the first
 * UTC instant at which `timeZone`'s offset changes — i.e. a real DST
 * transition, discovered from Node's actual tzdata rather than a
 * hardcoded calendar date this codebase would have to keep updated as
 * DST rules occasionally shift. Returns null if no transition is found
 * within the window (e.g. a timezone that doesn't observe DST at all).
 */
export function findNextDstTransition(fromUtc: Date, timeZone: string, maxDays = 400): Date | null {
  let previousOffset = getOffsetMinutes(fromUtc, timeZone);
  for (let day = 1; day <= maxDays; day++) {
    const candidate = new Date(fromUtc.getTime() + day * 86400000);
    const offset = getOffsetMinutes(candidate, timeZone);
    if (offset !== previousOffset) {
      // Binary-search within this one day for the exact transition instant
      // (to second-level precision — plenty for a "which side of the
      // transition is this UTC instant on" check, and cheap: ~17
      // iterations to narrow an 86400s window down to 1s), rather than
      // reporting an up-to-24h-late boundary.
      let lo = candidate.getTime() - 86400000;
      let hi = candidate.getTime();
      const hiOffset = offset;
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (getOffsetMinutes(new Date(mid), timeZone) === hiOffset) hi = mid;
        else lo = mid;
      }
      return new Date(hi);
    }
    previousOffset = offset;
  }
  return null;
}
