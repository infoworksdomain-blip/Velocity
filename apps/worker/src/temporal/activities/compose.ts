import { createHash } from "node:crypto";
import type { ComposeSpec, CompositionOutput } from "@velocity/contracts";
import { getCompositor, runInWorkspaceTx } from "./context.js";
import { withStep } from "./step-ledger.js";

/**
 * Compositing (STEP 8.4) — not metered through usage_events (C5 scopes
 * metering to AI provider calls: video/image/text/tts/transcription; a
 * composition pass over already-generated assets is not itself a model
 * call). Still routed through the render_steps ledger for idempotency: a
 * retried compose must not re-run the composition (which could be a real,
 * expensive Lambda invocation in production) — it's not "free" even
 * though it isn't AI-metered.
 */
export async function compose(workspaceId: string, renderId: string, spec: ComposeSpec): Promise<CompositionOutput> {
  const compositor = getCompositor();
  const stepKey = `compose:${createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16)}`;

  const result = await withStep({
    runInWorkspaceTx: (fn) => runInWorkspaceTx(workspaceId, fn),
    workspaceId,
    renderId,
    stepKind: "compose",
    stepKey,
    provider: { id: "compositor", model: "stub-compositor" },
    jobKind: "video",
    units: 0,
    skipMetering: true,
    submit: async () => {
      const output = await compositor.compose(spec);
      return { providerId: "compositor", externalJobId: JSON.stringify(output) };
    },
    poll: async (handle) => {
      const output = JSON.parse(handle.externalJobId) as CompositionOutput;
      return { state: "succeeded", costUsd: 0, ...output };
    },
  });

  return {
    outputStorageKey: result.output.outputStorageKey as string,
    widthPx: result.output.widthPx as number,
    heightPx: result.output.heightPx as number,
    durationMs: result.output.durationMs as number,
    hasAudio: result.output.hasAudio as boolean,
  };
}
