import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // playwright-core does dynamic/native requires — keep it out of the bundle so
  // the Flow-automation API route (services/flow) works at runtime.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
