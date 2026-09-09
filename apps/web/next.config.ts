import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Post-STEP-22 audit remediation: a minimal self-contained server
  // bundle (server.js + only the node_modules it actually needs) is what
  // the new Dockerfile's runtime stage copies — without this, a
  // container image would need the entire monorepo's node_modules.
  //
  // Gated behind DOCKER_BUILD rather than always on: Next's standalone
  // output re-materialises pnpm's symlink-based node_modules structure
  // via real filesystem symlinks, which requires either Developer Mode or
  // admin privileges on Windows — confirmed by a real `next build` failure
  // in this sandbox (`EPERM: operation not permitted, symlink ...`,
  // Developer Mode confirmed OFF via the registry). A real Linux container
  // build (this Dockerfile's actual target) hits none of this — Linux
  // symlinks don't need elevated privileges — so the Dockerfile sets this
  // env var for its own `next build` step, and local/CI builds on this
  // Windows sandbox are left unaffected rather than silently broken.
  ...(process.env.DOCKER_BUILD === "1"
    ? {
        output: "standalone" as const,
        // Without this, Next's file tracing defaults to this app's own
        // directory (per Next's own docs' monorepo caveat) and won't find
        // the workspace:* packages (@velocity/core, @velocity/db, ...)
        // that live under ../../packages — set to the monorepo root so
        // the trace actually reaches them.
        outputFileTracingRoot: path.join(__dirname, "../.."),
      }
    : {}),
  transpilePackages: ["@velocity/core", "@velocity/contracts", "@velocity/ui"],
  // Playwright (via @velocity/providers' brand-intelligence crawler,
  // server-only, imported from the onboarding router) ships native
  // Node bindings and an optional chromium-bidi dependency that isn't
  // installed and isn't needed for our usage. `serverExternalPackages`
  // alone did not stop webpack from trying to bundle it for the route
  // handler in this Next version, so the webpack `externals` list below
  // is the belt-and-suspenders fix — both are kept since neither is
  // harmful on its own.
  serverExternalPackages: ["playwright", "playwright-core", "@velocity/providers"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existingExternals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existingExternals, "playwright", "playwright-core", "chromium-bidi"];
    }
    return config;
  },
};

export default nextConfig;
