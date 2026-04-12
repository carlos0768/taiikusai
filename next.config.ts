import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @resvg/resvg-js contains a native .node binding that Turbopack cannot
  // place inside an ESM chunk. Marking it as a server external package tells
  // Next.js to require() it at runtime from node_modules instead of bundling.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
