import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@velocity/core", "@velocity/contracts"],
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
