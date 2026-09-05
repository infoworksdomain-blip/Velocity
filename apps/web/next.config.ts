import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@velocity/core", "@velocity/contracts"],
};

export default nextConfig;
