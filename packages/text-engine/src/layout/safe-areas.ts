import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Platform safe-area insets (build script 8B.5's "the detail everyone gets
 * wrong"). Kept in config/safe-areas.json, not hard-coded — platform UI
 * chrome moves, and this file is the versioned record of what it covered
 * on any given date.
 */
export const SafeAreaInsetsSchema = z.object({
  topInset: z.number().nonnegative(),
  bottomInset: z.number().nonnegative(),
  rightInset: z.number().nonnegative(),
  leftInset: z.number().nonnegative(),
});
export type SafeAreaInsets = z.infer<typeof SafeAreaInsetsSchema>;

export const SafeAreasConfigSchema = z.object({
  version: z.number().int().positive(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  platforms: z.record(z.string(), SafeAreaInsetsSchema),
});
export type SafeAreasConfig = z.infer<typeof SafeAreasConfigSchema>;

export interface BoundingBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function insetsToBox(insets: SafeAreaInsets, frameWidth: number, frameHeight: number): BoundingBox {
  return {
    top: insets.topInset,
    bottom: frameHeight - insets.bottomInset,
    left: insets.leftInset,
    right: frameWidth - insets.rightInset,
  };
}

/**
 * When one render must serve multiple platforms (TextPlan.platformVariants
 * can list more than one), the safe box is the geometric INTERSECTION of
 * every target platform's box — text placed anywhere in the intersection is
 * legible on all of them at once. Build-script 8B.5: "clamps every overlay
 * into the intersection of all target platforms' safe boxes... or renders
 * per-platform variants when the text would have to shrink below the
 * preset's minimum" — the second half (per-platform variants) is the
 * caller's decision once this returns a box too small to fit; this
 * function only computes the geometry.
 */
export function intersectSafeBoxes(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) throw new Error("intersectSafeBoxes requires at least one box");
  return boxes.reduce((acc, box) => ({
    top: Math.max(acc.top, box.top),
    bottom: Math.min(acc.bottom, box.bottom),
    left: Math.max(acc.left, box.left),
    right: Math.min(acc.right, box.right),
  }));
}

export function boxWidth(box: BoundingBox): number {
  return box.right - box.left;
}

export function boxHeight(box: BoundingBox): number {
  return box.bottom - box.top;
}

/** True only when the intersection still has positive area — a degenerate (inverted) box means the platforms' safe areas don't overlap at all for this frame size. */
export function isViableBox(box: BoundingBox): boolean {
  return boxWidth(box) > 0 && boxHeight(box) > 0;
}

let cachedConfig: SafeAreasConfig | null = null;

/** Loads and validates config/safe-areas.json once per process. Path is resolved relative to the repo root via an explicit argument rather than a guessed relative path — see the CLAUDE.md note on FileProviderConfigSource's CWD-relative bug from STEP 8. */
export function loadSafeAreasConfig(absolutePath: string): SafeAreasConfig {
  if (cachedConfig) return cachedConfig;
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8"));
  cachedConfig = SafeAreasConfigSchema.parse(raw);
  return cachedConfig;
}

/** Test-only: clears the module-level cache so a test that loads a fixture config doesn't leak into the next test. */
export function resetSafeAreasConfigForTests(): void {
  cachedConfig = null;
}

export function boxForPlatforms(config: SafeAreasConfig, platforms: string[]): BoundingBox {
  const boxes = platforms.map((platform) => {
    const insets = config.platforms[platform];
    if (!insets) throw new Error(`No safe-area insets configured for platform "${platform}"`);
    return insetsToBox(insets, config.frameWidth, config.frameHeight);
  });
  return intersectSafeBoxes(boxes);
}
