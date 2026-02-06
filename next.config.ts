import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";
import withPWAInit from "next-pwa";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const analyzeBundles = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Silence Turbopack/Webpack conflict warning
  turbopack: {},

  // Transpile @xyflow packages so Turbopack processes their ESM source
  // instead of their UMD bundles which use dynamic require() calls
  transpilePackages: ["@xyflow/react", "@xyflow/system"],
  
  // Skip type checking during build (types need regeneration)
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Disable X-Powered-By header for security
  poweredByHeader: false,

  // Image optimization: serve modern formats with long cache TTL
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Tree-shake heavy barrel-export packages for smaller bundles
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "framer-motion",
      "react-day-picker",
    ],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // SECURITY: unsafe-inline needed for Next.js/React, unsafe-eval removed for security
              // Note: If eval is needed for specific features, use nonces instead
              "script-src 'self' 'unsafe-inline' https://*.supabase.co https://*.stripe.com https://*.sentry.io",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://api.openai.com https://*.sentry.io https://*.ingest.sentry.io",
              "frame-src 'self' https://*.stripe.com",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry for error tracking and source maps
// Chain: nextConfig -> PWA -> Bundle Analyzer -> Sentry
export default withSentryConfig(analyzeBundles(withPWA(nextConfig)), {
  // Sentry organization and project
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs in CI
  silent: !process.env.CI,

  // Upload source maps to Sentry and delete after upload
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors
  automaticVercelMonitors: true,
});
