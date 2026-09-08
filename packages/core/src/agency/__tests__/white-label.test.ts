import { describe, expect, it } from "vitest";
import { paletteToCssCustomProperties, resolveBrandingForHost, validatePalette, type WhiteLabelBranding } from "../white-label";

describe("validatePalette", () => {
  it("accepts a real, well-formed palette", () => {
    const result = validatePalette({ "--flare": "#FF4D12", "--paper": "#FFFFFF", "--ember": "rgba(0, 0, 0, 0.5)" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a malformed token name", () => {
    const result = validatePalette({ "flare": "#FF4D12" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("flare");
  });

  it("rejects a value attempting to break out of the generated CSS block (a real XSS-prevention check, not just documentation)", () => {
    const result = validatePalette({ "--flare": "red; } </style><script>alert(1)</script>" });
    expect(result.valid).toBe(false);
  });

  it("collects multiple errors across a palette with several bad entries", () => {
    const result = validatePalette({ "bad-name": "red", "--ok": "not/*allowed*/" });
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("paletteToCssCustomProperties", () => {
  it("produces a real, well-formed :root CSS block", () => {
    const css = paletteToCssCustomProperties({ "--flare": "#FF4D12", "--paper": "#FFFFFF" });
    expect(css).toContain(":root {");
    expect(css).toContain("--flare: #FF4D12;");
    expect(css).toContain("--paper: #FFFFFF;");
  });
});

describe("resolveBrandingForHost", () => {
  const configs: WhiteLabelBranding[] = [
    { partnerId: "p1", customDomain: "client.example.com", logoStorageKey: "logo1.png", palette: {}, removeBranding: true },
    { partnerId: "p2", customDomain: "agency.example.com", logoStorageKey: "logo2.png", palette: {}, removeBranding: false },
  ];

  it("resolves the correct partner for an exact host match", () => {
    const result = resolveBrandingForHost("client.example.com", configs);
    expect(result?.partnerId).toBe("p1");
  });

  it("matches case-insensitively, since real DNS hostnames are case-insensitive", () => {
    const result = resolveBrandingForHost("CLIENT.EXAMPLE.COM", configs);
    expect(result?.partnerId).toBe("p1");
  });

  it("strips a trailing port from the Host header before matching (real local-dev browser behavior)", () => {
    const result = resolveBrandingForHost("agency.example.com:3000", configs);
    expect(result?.partnerId).toBe("p2");
  });

  it("returns null for a host with no matching white-label config", () => {
    expect(resolveBrandingForHost("unrelated.example.com", configs)).toBeNull();
  });
});
