/**
 * Worker entrypoint placeholder (STEP 1).
 *
 * Real responsibilities land later:
 * - BullMQ consumers for short jobs (notifications, quota sync, webhook
 *   delivery) — added alongside the module that owns each job type.
 * - Temporal worker registration for the render workflow (STEP 8):
 *   resolveAssets -> generateShots -> generateVO -> align -> composeText
 *   -> compose -> normalise -> provenance -> qc -> publishReady.
 * - Temporal worker registration for the publish workflow (STEP 12):
 *   preflight -> mediaStage -> platformInit -> upload -> poll -> confirm
 *   -> record.
 *
 * See ADR 0001 for the BullMQ-vs-Temporal boundary rule this process
 * implements both sides of.
 */

console.log("[worker] placeholder entrypoint — see STEP 8 and STEP 12");
