import { lookup as dnsLookup, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { promisify } from "node:util";

/**
 * SSRF defense for the brand-intelligence crawler (STEP 6). The brand
 * ingest fetches arbitrary customer-supplied URLs — a real attack surface
 * (STEP 1's threat model, item 3). This is the mitigation, not a
 * placeholder: resolve DNS before connecting, reject private/reserved
 * ranges, and — the detail that actually matters — pin the connection to
 * the address we just validated rather than letting Node re-resolve at
 * connect time, which is exactly the gap a DNS-rebinding attack exploits
 * (a hostname that resolves safely at check-time and rebinds to a private
 * IP a moment later).
 */

const dnsLookupAsync = promisify(dnsLookup);

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const USER_AGENT = "VelocityBrandIntelligenceBot/0.1 (+https://velocity.invalid/bot)";

export type AddressFamily = 4 | 6;

export function isDisallowedAddress(address: string, family: AddressFamily): boolean {
  if (family === 4) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true; // malformed -> fail closed
    const [a, b] = octets as [number, number, number, number];
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // RFC 1918
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, includes the 169.254.169.254 cloud metadata address
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
    if (a === 192 && b === 168) return true; // RFC 1918
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  const normalized = address.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("::ffff:")) {
    const embeddedIpv4 = normalized.slice("::ffff:".length);
    if (embeddedIpv4.includes(".")) return isDisallowedAddress(embeddedIpv4, 4);
  }
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local

  return false;
}

export interface ResolvedHost {
  address: string;
  family: AddressFamily;
}

export async function resolveSafely(hostname: string): Promise<ResolvedHost> {
  const literalFamily = isIP(hostname);
  const resolved: ResolvedHost =
    literalFamily > 0
      ? { address: hostname, family: literalFamily as AddressFamily }
      : await (async () => {
          const result = await dnsLookupAsync(hostname);
          return { address: result.address, family: result.family as AddressFamily };
        })();

  if (isDisallowedAddress(resolved.address, resolved.family)) {
    throw new Error(
      `SSRF defense: refusing to connect to "${hostname}" — resolves to disallowed address ${resolved.address}`,
    );
  }
  return resolved;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface SafeFetchOptions {
  maxResponseBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export async function safeFetch(inputUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  return safeFetchInternal(inputUrl, options, options.maxRedirects ?? DEFAULT_MAX_REDIRECTS);
}

async function safeFetchInternal(
  inputUrl: string,
  options: SafeFetchOptions,
  redirectsRemaining: number,
): Promise<SafeFetchResult> {
  const url = new URL(inputUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SSRF defense: refusing non-http(s) scheme "${url.protocol}"`);
  }

  const resolved = await resolveSafely(url.hostname);
  const client = url.protocol === "https:" ? https : http;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<SafeFetchResult>((resolvePromise, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": USER_AGENT },
        // The pin: Node is told the address is already known, so it never
        // performs its own DNS resolution for this request. Node's
        // Happy-Eyeballs dual-stack connection logic can invoke this with
        // `options.all` set, expecting an array-of-results callback shape
        // instead of the single (address, family) shape — both call
        // conventions must be handled, or the request fails with an
        // opaque "Invalid IP address: undefined" deep inside net.connect.
        lookup: (_hostname: string, opts: LookupOptions, callback) => {
          if (opts.all) {
            callback(null, [{ address: resolved.address, family: resolved.family }]);
          } else {
            callback(null, resolved.address, resolved.family);
          }
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsRemaining <= 0) {
            reject(new Error("SSRF-safe fetch: too many redirects"));
            return;
          }
          const nextUrl = new URL(res.headers.location, url).toString();
          // Recurses through safeFetchInternal, so the redirect target's
          // hostname is resolved and validated again from scratch — this
          // is the "re-check after redirect" the threat model requires.
          resolvePromise(safeFetchInternal(nextUrl, options, redirectsRemaining - 1));
          return;
        }

        let received = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxResponseBytes) {
            req.destroy(new Error("SSRF-safe fetch: response exceeded size cap"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            headers[key] = Array.isArray(value) ? value.join(", ") : (value ?? "");
          }
          resolvePromise({ finalUrl: url.toString(), status, body: Buffer.concat(chunks).toString("utf8"), headers });
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error("SSRF-safe fetch: request timed out")));
    req.on("error", reject);
    req.end();
  });
}
