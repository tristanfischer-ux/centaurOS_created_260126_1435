import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyzeBundles = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  turbopack: {},

  // Required for Docker runner image (copies .next/standalone)
  output: "standalone",

  // DECISION: Skip TypeScript checking during next build — CI (.github/workflows/ci.yml)
  // runs `tsc --noEmit` on every push/PR, so type safety is enforced before merge.
  // The in-build checker OOMs on Vercel's 8GB container with our codebase size.
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Disable X-Powered-By header for security
  poweredByHeader: false,

  // Image optimization: disabled globally.
  // Next.js 16's optimizer silently fails on many of our PNGs (specialist
  // avatars, hero images, marketing photos) — returning broken/empty images
  // with no error. Until the root cause is resolved, serve originals directly.
  images: {
    unoptimized: true,
  },

  // Tree-shake heavy barrel-export packages for smaller bundles
  experimental: {
    // INTENT: Raise server action body size limit from 1MB default to 8MB.
    // Module image generation sends hero product image (~2MB base64) + module
    // crop per call. Complex products with large hero images need >4MB.
    serverActions: {
      bodySizeLimit: "8mb",
    },
    // SECURITY: framer-motion removed — optimizePackageImports breaks its
    // constructor exports in production builds, causing "Object is not a
    // constructor (evaluating 'new A.A')" crashes.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "react-day-picker",
    ],
    // INTENT: Keep previously-visited pages in the client router cache so
    // back/forward navigation is instant. dynamic:30 means a page you left
    // 30s ago loads from cache while revalidating in the background.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    // INTENT: Enable the browser-native View Transitions API so page swaps
    // get a subtle crossfade instead of an abrupt pop. Degrades gracefully
    // on browsers that don't support it.
    viewTransition: true,
  },

  // Webpack: stub Node.js built-ins that pptxgenjs imports (node:fs, node:https).
  // pptxgenjs is only used client-side via dynamic import for PPTX download,
  // but webpack still resolves its dependencies when building the chunk.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack: (config: any, { isServer, webpack }: any) => {
    if (!isServer) {
      // Strip the node: URL scheme so webpack can resolve via fallback
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "")
        })
      )
      // Provide empty modules for Node.js built-ins in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
      }
    }
    return config
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
              "worker-src 'self' blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://api.openai.com https://*.sentry.io https://*.ingest.sentry.io",
              // SECURITY: Allow iframes from any origin for the in-app browser (/browse).
              // The iframe uses sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              // to restrict embedded page capabilities (no top-navigation, no pointer-lock).
              "frame-src 'self' https://*.stripe.com https:",
              // SECURITY: worker-src allows Three.js Web Workers for 3D rendering (blob: URLs)
              "worker-src 'self' blob:",
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
// Chain: nextConfig -> Bundle Analyzer -> Sentry
export default withSentryConfig(analyzeBundles(nextConfig), {
  // Sentry organization and project
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs in CI
  silent: !process.env.CI,

  // Upload source maps to Sentry and delete after upload
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  webpack: {
    // Automatically tree-shake Sentry logger statements
    treeshake: {
      removeDebugLogging: true,
    },
    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  },
});
