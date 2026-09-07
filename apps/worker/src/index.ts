/**
 * Worker entrypoint (STEP 8). Boots the Temporal worker for the render
 * workflow: resolveAssets -> generateShots -> generateVO -> align ->
 * composeText -> compose -> normalise -> provenance -> qc -> publishReady.
 * The publish workflow (STEP 12) registers alongside this on its own
 * task queue when that step lands. See ADR 0001 for the BullMQ-vs-Temporal
 * boundary rule this process implements both sides of.
 */
import { startRenderWorker } from "./temporal/worker.js";

startRenderWorker().catch((err) => {
  console.error("[worker] render worker crashed:", err);
  process.exit(1);
});
