import { bestTimesFor } from "./best-time.js";
import { capFor, type PlatformCapsConfig } from "./platform-caps.js";
import { zonedTimeToUtc } from "./timezone.js";

export interface AutoFillAccount {
  socialAccountId: string;
  platform: string;
}

export interface AutoFillContentItem {
  contentItemId: string;
  format: string;
  angleKind: string;
  hookPattern: string | null;
  /** When set, this item may only be scheduled within [campaignStartsAt, campaignEndsAt] — build script: "assign saved content under constraints: ... campaign windows." */
  campaignId: string | null;
}

export interface AutoFillCampaignWindow {
  campaignId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ExistingSlot {
  socialAccountId: string;
  scheduledAtUtc: Date;
}

export interface AutoFillInput {
  workspaceTimezone: string;
  startDate: { year: number; month: number; day: number };
  days: number;
  accounts: AutoFillAccount[];
  contentPool: AutoFillContentItem[];
  existingSlots: ExistingSlot[];
  campaignWindows: AutoFillCampaignWindow[];
  platformCaps: PlatformCapsConfig;
  /** STEP 13: real, workspace-specific best times (calendar/best-time.ts's `computeWorkspaceBestTimes`), keyed by platform. When a platform has no entry, `bestTimesFor`'s general heuristic is used — the same honest fallback `computeWorkspaceBestTimes` itself returns `null` for below its 30-distinct-day threshold. */
  bestTimesOverride?: Partial<Record<string, string[]>>;
}

export interface AutoFillAssignment {
  contentItemId: string;
  socialAccountId: string;
  scheduledAtUtc: Date;
}

export interface AutoFillUnfilled {
  socialAccountId: string;
  scheduledAtUtc: Date;
  reason: "cap_breach" | "min_spacing" | "no_eligible_content";
}

export interface AutoFillResult {
  assignments: AutoFillAssignment[];
  unfilled: AutoFillUnfilled[];
}

function addDays(date: { year: number; month: number; day: number }, n: number): { year: number; month: number; day: number } {
  const utcMs = Date.UTC(date.year, date.month - 1, date.day) + n * 86400000;
  const d = new Date(utcMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function parseHm(hm: string): { hour: number; minute: number } {
  const [hour, minute] = hm.split(":").map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

/** Real cap enforcement (C6): counts posts already scheduled for this account within the rolling window ending at `atUtc`, across BOTH pre-existing slots and slots this same auto-fill run has already assigned. */
function countInRollingWindow(socialAccountId: string, atUtc: Date, windowHours: number, allSlots: ExistingSlot[]): number {
  const windowStartMs = atUtc.getTime() - windowHours * 3600000;
  return allSlots.filter((s) => s.socialAccountId === socialAccountId && s.scheduledAtUtc.getTime() > windowStartMs && s.scheduledAtUtc.getTime() <= atUtc.getTime()).length;
}

function violatesMinSpacing(socialAccountId: string, atUtc: Date, minSpacingMinutes: number, allSlots: ExistingSlot[]): boolean {
  const spacingMs = minSpacingMinutes * 60000;
  return allSlots.some((s) => s.socialAccountId === socialAccountId && Math.abs(s.scheduledAtUtc.getTime() - atUtc.getTime()) < spacingMs);
}

function withinCampaignWindow(item: AutoFillContentItem, atUtc: Date, campaignWindows: AutoFillCampaignWindow[]): boolean {
  if (!item.campaignId) return true; // no campaign constraint on this item
  const window = campaignWindows.find((w) => w.campaignId === item.campaignId);
  if (!window) return false; // a campaign-bound item with no matching window is never eligible — fail closed, not silently ignored
  return atUtc.getTime() >= window.startsAt.getTime() && atUtc.getTime() <= window.endsAt.getTime();
}

/**
 * Picks the next eligible content item for a slot, in a defined
 * constraint-relaxation order — build script: "hook-pattern rotation ...
 * matters more than format diversity for feed fatigue," so format
 * diversity is the FIRST constraint relaxed under pressure, hook-pattern
 * rotation the second-to-last, angle rotation relaxed first of all three
 * (least emphasized in the build script's own wording). Caps and spacing
 * are never relaxed — those are C6, non-negotiable; this function is only
 * ever called for a slot that already cleared both.
 */
function pickContentForSlot(pool: AutoFillContentItem[], lastOnAccount: AutoFillContentItem | null, atUtc: Date, campaignWindows: AutoFillCampaignWindow[]): AutoFillContentItem | null {
  const eligible = pool.filter((item) => withinCampaignWindow(item, atUtc, campaignWindows));
  if (eligible.length === 0) return null;
  if (!lastOnAccount) return eligible[0]!;

  const relaxationOrder: ((item: AutoFillContentItem) => boolean)[] = [
    (item) => item.angleKind !== lastOnAccount.angleKind && item.hookPattern !== lastOnAccount.hookPattern && item.format !== lastOnAccount.format,
    (item) => item.hookPattern !== lastOnAccount.hookPattern && item.format !== lastOnAccount.format, // angle rotation relaxed
    (item) => item.hookPattern !== lastOnAccount.hookPattern, // format diversity also relaxed
    () => true, // hook-pattern rotation also relaxed — last resort, only when the pool truly has nothing better
  ];

  for (const passes of relaxationOrder) {
    const match = eligible.find(passes);
    if (match) return match;
  }
  return null; // unreachable (the last relaxation level accepts anything), kept for exhaustiveness
}

/**
 * The 30-day one-shot auto-fill (STEP 10, GATE 10). Pure — takes the
 * current DB state as plain input, returns a PROPOSED assignment set
 * ("present as a diff the user approves before commit," build script);
 * nothing here writes to a database. Deterministic: same input always
 * produces the same output, which is what makes GATE 10's "zero cap
 * violations, zero double-bookings" claim mechanically checkable in a
 * test rather than a matter of re-running and hoping.
 */
export function autoFillCalendar(input: AutoFillInput): AutoFillResult {
  const assignments: AutoFillAssignment[] = [];
  const unfilled: AutoFillUnfilled[] = [];
  const remainingPool = [...input.contentPool];
  const allSlots: ExistingSlot[] = [...input.existingSlots];
  const lastAssignedByAccount = new Map<string, AutoFillContentItem>();

  for (let day = 0; day < input.days; day++) {
    const date = addDays(input.startDate, day);

    for (const account of input.accounts) {
      const cap = capFor(input.platformCaps, account.platform);
      const times = input.bestTimesOverride?.[account.platform] ?? bestTimesFor(account.platform);

      for (const hm of times) {
        const { hour, minute } = parseHm(hm);
        const scheduledAtUtc = zonedTimeToUtc({ year: date.year, month: date.month, day: date.day, hour, minute }, input.workspaceTimezone);

        if (countInRollingWindow(account.socialAccountId, scheduledAtUtc, cap.windowHours, allSlots) >= cap.postsPerRollingWindow) {
          unfilled.push({ socialAccountId: account.socialAccountId, scheduledAtUtc, reason: "cap_breach" });
          continue;
        }
        if (violatesMinSpacing(account.socialAccountId, scheduledAtUtc, cap.minSpacingMinutes, allSlots)) {
          unfilled.push({ socialAccountId: account.socialAccountId, scheduledAtUtc, reason: "min_spacing" });
          continue;
        }

        const chosen = pickContentForSlot(remainingPool, lastAssignedByAccount.get(account.socialAccountId) ?? null, scheduledAtUtc, input.campaignWindows);
        if (!chosen) {
          unfilled.push({ socialAccountId: account.socialAccountId, scheduledAtUtc, reason: "no_eligible_content" });
          continue;
        }

        assignments.push({ contentItemId: chosen.contentItemId, socialAccountId: account.socialAccountId, scheduledAtUtc });
        allSlots.push({ socialAccountId: account.socialAccountId, scheduledAtUtc });
        lastAssignedByAccount.set(account.socialAccountId, chosen);
        remainingPool.splice(remainingPool.indexOf(chosen), 1);

        if (remainingPool.length === 0) return { assignments, unfilled };
      }
    }
  }

  return { assignments, unfilled };
}
