import { it, type TestFunction } from "vitest";
import { isDatabaseReachable } from "./db-availability";

/**
 * Wraps `it` so a test skips (visibly, via ctx.skip()) instead of failing
 * or silently passing when DATABASE_URL isn't reachable. This must never
 * be read as "the test passed" — a skipped GATE 2 check is reported as
 * "could not run," not as green, per the build script's own rule that a
 * gate is never marked passed if a check could not be verified.
 */
export function itWithDb(name: string, fn: TestFunction, timeout?: number): void {
  it(
    name,
    async (ctx) => {
      const reachable = await isDatabaseReachable(process.env.DATABASE_URL);
      if (!reachable) {
        ctx.skip();
        return;
      }
      await fn(ctx);
    },
    timeout,
  );
}
