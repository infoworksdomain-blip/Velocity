import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDisallowedAddress, resolveSafely, safeFetch } from "../ssrf-safe-fetch";

describe("isDisallowedAddress — IPv4/IPv6 private and reserved ranges", () => {
  it.each([
    ["127.0.0.1", true, "loopback"],
    ["10.0.0.5", true, "RFC 1918 10/8"],
    ["172.16.0.1", true, "RFC 1918 172.16/12 (lower bound)"],
    ["172.31.255.255", true, "RFC 1918 172.16/12 (upper bound)"],
    ["172.32.0.1", false, "just outside 172.16/12"],
    ["192.168.1.1", true, "RFC 1918 192.168/16"],
    ["169.254.169.254", true, "cloud metadata endpoint"],
    ["169.254.0.1", true, "link-local"],
    ["0.0.0.0", true, "this-network"],
    ["8.8.8.8", false, "public (Google DNS)"],
    ["93.184.216.34", false, "public (example.com-shaped)"],
  ] as const)("%s -> disallowed=%s (%s)", (address, expected, _description) => {
    expect(isDisallowedAddress(address, 4)).toBe(expected);
  });

  it.each([
    ["::1", true, "loopback"],
    ["fe80::1", true, "link-local"],
    ["fc00::1", true, "unique local"],
    ["fd12:3456::1", true, "unique local"],
    ["::ffff:127.0.0.1", true, "IPv4-mapped loopback"],
    ["::ffff:8.8.8.8", false, "IPv4-mapped public"],
    ["2001:4860:4860::8888", false, "public (Google DNS)"],
  ] as const)("%s -> disallowed=%s (%s)", (address, expected, _description) => {
    expect(isDisallowedAddress(address, 6)).toBe(expected);
  });
});

describe("resolveSafely — literal IPs (no DNS needed)", () => {
  it("rejects a loopback literal", async () => {
    await expect(resolveSafely("127.0.0.1")).rejects.toThrow(/SSRF defense/);
  });

  it("rejects the cloud metadata literal", async () => {
    await expect(resolveSafely("169.254.169.254")).rejects.toThrow(/SSRF defense/);
  });

  it("accepts a public-looking literal", async () => {
    const result = await resolveSafely("8.8.8.8");
    expect(result).toEqual({ address: "8.8.8.8", family: 4 });
  });
});

describe("safeFetch vs. a local metadata-endpoint honeypot", () => {
  let honeypot: http.Server;
  let honeypotUrl: string;

  beforeAll(async () => {
    honeypot = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ "iam-role": "should-never-be-reachable" }));
    });
    await new Promise<void>((resolve) => honeypot.listen(0, "127.0.0.1", resolve));
    const { port } = honeypot.address() as AddressInfo;
    honeypotUrl = `http://127.0.0.1:${port}/latest/meta-data/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => honeypot.close(() => resolve()));
  });

  it("refuses to fetch a loopback honeypot even though it's actually listening and reachable", async () => {
    await expect(safeFetch(honeypotUrl)).rejects.toThrow(/SSRF defense/);
  });

  it("refuses a non-http(s) scheme outright", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(/refusing non-http/);
  });
});

describe("safeFetch against a real public site (network-dependent smoke test)", () => {
  it("fetches example.com successfully", async () => {
    const result = await safeFetch("http://example.com/");
    expect(result.status).toBe(200);
    expect(result.body.toLowerCase()).toContain("example domain");
  });
});
