/**
 * Render service entrypoint (STEP 8). Registers the real Remotion
 * compositions (`VerticalVideo`, `Slideshow`) — real component shape, not
 * invoked by the render pipeline yet (apps/worker's `compose` activity
 * uses a stub compositor pending real shot/VO media and a deployed
 * Lambda function; see docs/steps/STEP-08.md). STEP 8B adds the text-layer
 * components consuming the TextPlan contract, rendered inside
 * `TextLayerSlot`.
 */
import { registerRoot } from "remotion";
import { RemotionRoot } from "./root.js";

registerRoot(RemotionRoot);
