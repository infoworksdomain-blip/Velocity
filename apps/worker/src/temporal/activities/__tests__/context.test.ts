import { afterEach, describe, expect, it, vi } from "vitest";
import { readRemotionLambdaConfig } from "../context.js";

/**
 * Post-STEP-22 audit remediation: proves the env-var-gated compositor
 * selection (getCompositor() in context.ts) actually behaves like every
 * other "self-adapting on credential presence" registration in this file
 * — real config when fully configured, null (falls back to
 * StubCompositor) when any piece is missing, rather than a partial,
 * half-broken config silently reaching RemotionLambdaCompositor.
 */
describe("readRemotionLambdaConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns null when none of the REMOTION_AWS_* vars are set (the default: stays on StubCompositor)", () => {
    vi.stubEnv("REMOTION_AWS_REGION", "");
    vi.stubEnv("REMOTION_AWS_LAMBDA_FUNCTION_NAME", "");
    vi.stubEnv("REMOTION_SITE_URL", "");
    expect(readRemotionLambdaConfig()).toBeNull();
  });

  it("returns null when only some of the three vars are set", () => {
    vi.stubEnv("REMOTION_AWS_REGION", "us-east-1");
    vi.stubEnv("REMOTION_AWS_LAMBDA_FUNCTION_NAME", "");
    vi.stubEnv("REMOTION_SITE_URL", "");
    expect(readRemotionLambdaConfig()).toBeNull();
  });

  it("returns a real config, with compositionId fixed to VerticalVideo, when all three vars are set", () => {
    vi.stubEnv("REMOTION_AWS_REGION", "us-east-1");
    vi.stubEnv("REMOTION_AWS_LAMBDA_FUNCTION_NAME", "remotion-render-velocity");
    vi.stubEnv("REMOTION_SITE_URL", "https://example.cloudfront.net/site");
    expect(readRemotionLambdaConfig()).toEqual({
      region: "us-east-1",
      functionName: "remotion-render-velocity",
      serveUrl: "https://example.cloudfront.net/site",
      compositionId: "VerticalVideo",
    });
  });
});
