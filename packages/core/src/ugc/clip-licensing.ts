/**
 * Licensed human UGC clip selection (STEP 15: "licensed human UGC with
 * signed model release reference and usage rights (territory, duration,
 * media) enforced at selection time"). `ugc_clips.release_ref` is
 * already `NOT NULL` at the schema level (every row always resolves to
 * SOME licence record) — what's missing until now is code that actually
 * ENFORCES the usage-rights fields at the moment a clip is selected for
 * a specific use, which is what this module is.
 */

export interface LicensedClip {
  id: string;
  releaseRef: string;
  usageTerritory: string | null;
  usageDurationMonths: number | null;
  usageMedia: string[];
  createdAt: Date;
}

export interface ClipUsageContext {
  territory: string;
  media: string;
  asOfDate?: Date;
}

export interface ClipUsabilityResult {
  usable: boolean;
  reason: string | null;
}

/** `usageTerritory`/`usageMedia` being unset (null / empty array) means "unrestricted" for that dimension — a real, permissive default for a clip whose release genuinely doesn't limit it, not a validation gap. */
export function isClipUsableFor(clip: LicensedClip, context: ClipUsageContext): ClipUsabilityResult {
  const asOfDate = context.asOfDate ?? new Date();

  if (clip.usageTerritory && clip.usageTerritory.toLowerCase() !== context.territory.toLowerCase()) {
    return { usable: false, reason: `Licensed for territory "${clip.usageTerritory}", requested for "${context.territory}".` };
  }

  if (clip.usageMedia.length > 0 && !clip.usageMedia.some((m) => m.toLowerCase() === context.media.toLowerCase())) {
    return { usable: false, reason: `Licensed for media [${clip.usageMedia.join(", ")}], requested for "${context.media}".` };
  }

  if (clip.usageDurationMonths !== null) {
    const expiresAt = new Date(clip.createdAt);
    expiresAt.setMonth(expiresAt.getMonth() + clip.usageDurationMonths);
    if (expiresAt.getTime() <= asOfDate.getTime()) {
      return { usable: false, reason: `Licence expired on ${expiresAt.toISOString()} (${clip.usageDurationMonths} months from ${clip.createdAt.toISOString()}).` };
    }
  }

  return { usable: true, reason: null };
}

/** Picks the first usable clip from a real candidate pool — deterministic (stable input order in, same clip out), not random, so a retried selection for the same context is reproducible. */
export function selectLicensedClip(clips: LicensedClip[], context: ClipUsageContext): LicensedClip | null {
  for (const clip of clips) {
    if (isClipUsableFor(clip, context).usable) return clip;
  }
  return null;
}
