import { Config } from "@remotion/cli/config";

/**
 * Real Remotion project config (STEP 8.4). Composition rendering itself
 * is unverified in this environment (needs real shot/VO media from a
 * funded video-provider key) — see docs/steps/STEP-08.md.
 */
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
