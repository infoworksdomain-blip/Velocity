import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { LocalDevEmailProvider, ResendEmailProvider, createEmailProvider } from "../email-provider.js";

/**
 * Same "real SDK against a local honeypot" discipline as
 * packages/text-engine's Anthropic/OpenAI adapter tests — there is no
 * funded Resend account in this environment, but the real `resend` SDK
 * client accepts a `baseUrl` override (its own documented constructor
 * option), so this proves the actual request the SDK sends and that the
 * adapter correctly parses a realistic Resend response shape.
 */
describe("ResendEmailProvider against a local mock Resend-shaped server", () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequest: { body: unknown; headers: http.IncomingHttpHeaders } | null = null;
  let responseOverride: { status: number; body: unknown } | null = null;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        lastRequest = { body: JSON.parse(raw || "{}"), headers: req.headers };
        const override = responseOverride;
        res.writeHead(override?.status ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify(override?.body ?? { id: "email-test-id" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(() => {
    responseOverride = null;
    lastRequest = null;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends the message's to/subject/text/html and the configured from address", async () => {
    const provider = new ResendEmailProvider("test-key", "noreply@velocity.app", { baseUrl });
    const result = await provider.send({ to: "user@example.com", subject: "Reset your password", text: "plain text body", html: "<p>html body</p>" });

    expect(result.messageId).toBe("email-test-id");
    expect(lastRequest?.body).toMatchObject({
      from: "noreply@velocity.app",
      to: "user@example.com",
      subject: "Reset your password",
      text: "plain text body",
      html: "<p>html body</p>",
    });
    expect(lastRequest?.headers.authorization).toBe("Bearer test-key");
  });

  it("falls back to text as the html body when no html is given (Resend requires at least one render field)", async () => {
    const provider = new ResendEmailProvider("test-key", "noreply@velocity.app", { baseUrl });
    await provider.send({ to: "user@example.com", subject: "Plain", text: "plain only" });

    expect(lastRequest?.body).toMatchObject({ text: "plain only", html: "plain only" });
  });

  it("throws with the real Resend error name and message when the API returns an error payload", async () => {
    responseOverride = { status: 422, body: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 } };
    const provider = new ResendEmailProvider("test-key", "noreply@velocity.app", { baseUrl });

    await expect(provider.send({ to: "bad", subject: "x", text: "x" })).rejects.toThrow(/validation_error.*Invalid `to` field/);
  });
});

describe("LocalDevEmailProvider", () => {
  it("never throws and returns a deterministic-shaped messageId", async () => {
    const provider = new LocalDevEmailProvider();
    const result = await provider.send({ to: "a@b.com", subject: "x", text: "y" });
    expect(result.messageId).toMatch(/^local-dev-\d+$/);
  });
});

describe("createEmailProvider", () => {
  const originalKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it("falls back to LocalDevEmailProvider when RESEND_API_KEY is unset", () => {
    delete process.env.RESEND_API_KEY;
    expect(createEmailProvider()).toBeInstanceOf(LocalDevEmailProvider);
  });

  it("returns a real ResendEmailProvider when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(createEmailProvider()).toBeInstanceOf(ResendEmailProvider);
  });
});
