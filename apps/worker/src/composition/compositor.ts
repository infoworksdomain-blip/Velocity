import type { CompositionOutput, ComposeSpec } from "@velocity/contracts";

/**
 * The `compose` activity's real dependency (STEP 8.4). A production
 * implementation renders via Remotion on Lambda (ADR 0002) — that needs a
 * deployed Lambda function and real shot/VO media, neither available here.
 * `StubCompositor` produces a correctly-*described* output (real
 * dimensions/duration derived from the spec) so QC's duration/aspect
 * checks run against real numbers even though no real video bytes exist.
 */
export interface Compositor {
  compose(spec: ComposeSpec): Promise<CompositionOutput>;
}
