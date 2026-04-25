/**
 * @file (public-forge-demos)/layout.tsx
 *
 * @description Layout for the /forge/demos route group. Anonymous visitors
 * reach these pages without a login session — the layout performs no auth
 * check so the pages render cleanly for any browser.
 *
 * Mirrors the anonymous branch of (public-investors)/layout.tsx: a minimal
 * marketing-style shell with PostHog and Tooltip providers, but no sidebar,
 * no foundry-scoped providers, and no onboarding modals. Authenticated users
 * who visit /forge/demos also get this stripped-down shell — the sidebar
 * lives on the /the-forge-v2 workspace page where the content belongs.
 *
 * The "Start your own project" call-to-action throughout these pages routes
 * to /signup?from=forge-demos&plan=starter_v2. Post-signup routing (wired in
 * the signup flow) lands new users at /the-forge-v2/new.
 *
 * @security Public — no auth check at the layout level. All assets are
 * static under /public/forge-demos/ and require no database access.
 */

import { TooltipProvider } from "@/components/ui/tooltip"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { OfflineIndicator } from "@/components/OfflineIndicator"
import { PostHogProvider } from "@/components/PostHogProvider"

export const dynamic = "force-dynamic"

export default function PublicForgeDemosLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PostHogProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <ErrorBoundary>
            <main
              id="main-content"
              className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 max-w-7xl mx-auto"
            >
              {children}
            </main>
          </ErrorBoundary>
          <OfflineIndicator />
        </div>
      </TooltipProvider>
    </PostHogProvider>
  )
}
