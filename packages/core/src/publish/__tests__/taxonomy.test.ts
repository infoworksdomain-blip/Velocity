import { describe, expect, it } from "vitest";
import { classifyPublishHttpFailure, classifyPublishNetworkFailure } from "../taxonomy";

describe("classifyPublishHttpFailure", () => {
  it("classifies a quota-flagged error as quota regardless of status", () => {
    expect(classifyPublishHttpFailure(400, true)).toBe("quota");
    expect(classifyPublishHttpFailure(200, true)).toBe("quota");
  });

  it("classifies 429 as transient", () => {
    expect(classifyPublishHttpFailure(429, false)).toBe("transient");
  });

  it("classifies any 5xx as transient", () => {
    expect(classifyPublishHttpFailure(500, false)).toBe("transient");
    expect(classifyPublishHttpFailure(503, false)).toBe("transient");
  });

  it("classifies 401/403 as terminal (a token problem, not a retry-worthy one)", () => {
    expect(classifyPublishHttpFailure(401, false)).toBe("terminal");
    expect(classifyPublishHttpFailure(403, false)).toBe("terminal");
  });

  it("classifies other 4xx as terminal", () => {
    expect(classifyPublishHttpFailure(400, false)).toBe("terminal");
    expect(classifyPublishHttpFailure(422, false)).toBe("terminal");
  });
});

describe("classifyPublishNetworkFailure", () => {
  it("is always transient", () => {
    expect(classifyPublishNetworkFailure()).toBe("transient");
  });
});
