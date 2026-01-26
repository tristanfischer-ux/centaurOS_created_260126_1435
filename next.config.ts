import type { NextConfig } from "next";

// @ts-expect-error next-pwa does not have types
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Silence Turbopack/Webpack conflict warning

  turbopack: {}
};

export default withPWA(nextConfig);
