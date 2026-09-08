import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "../signing";

describe("webhook signing", () => {
  it("produces a deterministic signature for the same secret and body", () => {
    const sig1 = signWebhookPayload("secret", '{"event":"render.completed"}');
    const sig2 = signWebhookPayload("secret", '{"event":"render.completed"}');
    expect(sig1).toBe(sig2);
  });

  it("produces a different signature for a different secret", () => {
    const sig1 = signWebhookPayload("secret-a", "body");
    const sig2 = signWebhookPayload("secret-b", "body");
    expect(sig1).not.toBe(sig2);
  });

  it("produces a different signature for a different body", () => {
    const sig1 = signWebhookPayload("secret", "body-a");
    const sig2 = signWebhookPayload("secret", "body-b");
    expect(sig1).not.toBe(sig2);
  });

  it("verifies a genuine signature", () => {
    const body = '{"event":"publication.succeeded"}';
    const signature = signWebhookPayload("secret", body);
    expect(verifyWebhookSignature("secret", body, signature)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signWebhookPayload("secret", '{"event":"a"}');
    expect(verifyWebhookSignature("secret", '{"event":"b"}', signature)).toBe(false);
  });

  it("rejects a forged signature of a different length", () => {
    expect(verifyWebhookSignature("secret", "body", "not-a-real-signature")).toBe(false);
  });

  it("rejects a well-formed but wrong signature", () => {
    const wrongButSameLength = signWebhookPayload("wrong-secret", "body");
    expect(verifyWebhookSignature("secret", "body", wrongButSameLength)).toBe(false);
  });
});
