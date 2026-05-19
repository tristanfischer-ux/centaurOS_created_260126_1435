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

  // Backwards-compat redirects for the old (supplier-portal) route group,
  // rehomed under /supplier/* in Phase 3 of the founder-first architecture.
  // Evaluated at the edge before middleware; beats the 404 fallback.
  async redirects() {
    return [
      { source: '/supplier-portal', destination: '/supplier', permanent: true },
      { source: '/supplier-portal/:path*', destination: '/supplier/:path*', permanent: true },
      // /recruits removed 2026-04-25 — redirect to /agents so existing
      // bookmarks and in-app links don't 404
      { source: '/recruits', destination: '/agents', permanent: false },
      { source: '/recruits/:path*', destination: '/agents', permanent: false },
      // /today: W38+W39 fix (2026-04-28) — page.tsx now renders TodayView,
      // so the config-level redirect is removed. The route is live at /today.
      // /plan removed 2026-04-25 — Brainstorming (/agents) is the closest analogue
      { source: '/plan', destination: '/agents', permanent: false },
      { source: '/plan/:path*', destination: '/agents', permanent: false },

      // 2026-05-19 chain unification: 32 orphan sub-routes under
      // /the-forge-v2/projects/[id]/* render empty UI because they read
      // autopilot-populated JSONB columns that the chain doesn't write.
      // Redirect every one to the canonical chain workspace page.
      // Audit drawer: forgeos/gotchas/ce939aa64cd9d42b.
      { source: '/the-forge-v2/projects/:id/brief',           destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/brief/:rest*',    destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/cost',            destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/cost/:rest*',     destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/modules',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/modules/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/bom',             destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/bom/:rest*',      destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/suppliers',       destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/suppliers/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/risks',           destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/risks/:rest*',    destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/readiness',       destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/readiness/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/review',          destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/review/:rest*',   destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/revisions',       destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/revisions/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/regulatory',      destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/regulatory/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/specialists',     destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/specialists/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/geometry',        destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/geometry/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/operations',      destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/operations/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/outputs',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/outputs/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/archive',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/archive/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/approve',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/approve/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/ask',             destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/ask/:rest*',      destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/assumption-test', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/assumption-test/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/brief-lock',      destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/brief-lock/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/compose',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/compose/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/export',          destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/export/:rest*',   destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/fork',            destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/fork/:rest*',     destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/launch',          destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/launch/:rest*',   destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/launch-plan',     destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/launch-plan/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/plan',            destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/plan/:rest*',     destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/promote',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/promote/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/request',         destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/request/:rest*',  destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/schedule',        destination: '/the-forge-v2/projects/:id', permanent: false },
      { source: '/the-forge-v2/projects/:id/schedule/:rest*', destination: '/the-forge-v2/projects/:id', permanent: false },

      // Legacy V1 workbench — redirect to chain unification entry point.
      // /the-forge/cad-lab and friends call retired() stubs with fallback chains
      // that don't route through pdf_engine_runs.
      { source: '/the-forge',                destination: '/the-forge-v2/start', permanent: false },
      { source: '/the-forge/:path*',         destination: '/the-forge-v2/start', permanent: false },
    ]
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
      dynamic: 0,
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
              // SECURITY (H-5 audit, 2026-04-02): 'unsafe-inline' is REQUIRED and cannot
              // be removed without breaking the app. Reasons:
              //
              // script-src 'unsafe-inline':
              //   1. Next.js injects inline <script> tags for hydration data (__NEXT_DATA__),
              //      route prefetching, and chunk loading — these are not controllable by app code
              //   2. Next.js does not yet support nonce-based CSP in the App Router production
              //      build (https://github.com/vercel/next.js/issues/43743)
              //   3. Sentry SDK initialization requires inline script execution
              //
              // style-src 'unsafe-inline':
              //   1. Radix UI (shadcn/ui) injects inline styles for portal positioning
              //      (dropdowns, tooltips, dialogs, popovers) — cannot be externalized
              //   2. Recharts uses inline SVG styles for chart rendering
              //   3. next/font injects inline style tags for font-face declarations
              //
              // MITIGATION: unsafe-eval is NOT allowed. XSS risk is reduced by:
              //   - All user content rendered via React (auto-escaped)
              //   - No dangerouslySetInnerHTML usage in app code
              //   - Strict form-action, base-uri, and object-src restrictions below
              //
              // TODO: Migrate to nonce-based CSP when Next.js App Router supports it
              //
              // 'wasm-unsafe-eval': CSP3 directive that permits WebAssembly
              // module compilation (strictly narrower than the full
              // script-executing directive — it only lets the browser compile
              // and instantiate .wasm modules). Required by
              // @react-pdf/renderer, which uses WASM for its PDF font and
              // layout pipeline. Without this, the Design Report PDF export
              // silently fails with a "WebAssembly.instantiate violates CSP"
              // message and the background op completes with zero output.
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://*.supabase.co https://*.stripe.com https://*.sentry.io https://*.posthog.com https://eu-assets.i.posthog.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "worker-src 'self' blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://api.openai.com https://*.sentry.io https://*.ingest.sentry.io https://*.posthog.com",
              // SECURITY: Allow iframes from any origin for the in-app browser (/browse).
              // The iframe uses sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              // to restrict embedded page capabilities (no top-navigation, no pointer-lock).
              "frame-src 'self' https://*.stripe.com https:",
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
