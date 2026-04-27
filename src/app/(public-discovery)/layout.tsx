/**
 * @file (public-discovery)/layout.tsx
 *
 * @description Layout for routes that allow unauthenticated visitors but
 * still need authenticated-user features when a session is present. Covers
 * /agents and /the-forge-v2 anonymous landing surfaces per RED-TEAM-PIVOT-PLAN
 * Tier 2 step 16.
 *
 * Mirrors (public-investors)/layout.tsx exactly. The (platform) layout
 * enforces a login redirect at the top, making these routes unreachable for
 * anonymous visitors. Splitting the landing pages into this route group lets
 * anonymous visitors land on /agents and /the-forge-v2 without weakening the
 * platform-wide auth gate.
 *
 * Deep-dive sub-routes (/agents/m/<id>, /the-forge-v2/projects/<id>/...) stay
 * under (platform) and continue to require login.
 *
 * For authenticated users the page fetches sidebar/profile data and renders
 * inside the full platform chrome. For anonymous visitors a marketing-style
 * minimal shell is used.
 *
 * @security Public — no auth check at the layout level. Page-level data
 * fetches still gate tier-aware fields server-side.
 */

import { Suspense } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ZoomProvider, MobileZoomControl } from "@/components/ZoomProvider"
import { ScreenContextProvider } from "@/contexts/screen-context"
import { BrowseContextProvider } from "@/contexts/browse-context"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { OfflineIndicator } from "@/components/OfflineIndicator"
import { PostHogProvider } from "@/components/PostHogProvider"
import { Sidebar } from "@/components/sidebar/Sidebar"
import { MobileNav } from "@/components/MobileNav"
import { MainContentArea } from "@/components/MainContentArea"
import { CommandPalette } from "@/components/CommandPalette"
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog"
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts"
import { ActiveTimerBar } from "@/components/time/active-timer-bar"
import { createClient } from "@/lib/supabase/server"
import { getCachedLayoutData } from "@/lib/supabase/cached-layout-data"
import { getFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_FORGE_EXPERIENCE } from "@/lib/features/keys"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export default async function PublicDiscoveryLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // ── Anonymous visitor ────────────────────────────────────────────
    // Stripped-down marketing-style shell. The page renders the teaser
    // experience and the signup wall lives inside the page client. No
    // sidebar, no providers that depend on a foundry, no onboarding modals.
    if (!user) {
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

    // ── Authenticated visitor ────────────────────────────────────────
    // Mirror the (platform) layout chrome so a logged-in founder sees the
    // same sidebar / nav / command palette they would on /today, /agents etc.
    const layoutData = await getCachedLayoutData(user.id)
    const { profile } = layoutData
    const {
        foundryName,
        foundryId,
        foundryLogoUrl,
        foundryIsSandbox,
        hasAdminAccess,
        userFoundries,
    } = layoutData

    const newForgeExperienceEnabled = await getFeatureFlag(
        supabase,
        user.id,
        FLAG_NEW_FORGE_EXPERIENCE,
    )

    return (
        <PostHogProvider>
            <TooltipProvider>
                <ZoomProvider>
                    <BrowseContextProvider>
                        <ScreenContextProvider>
                            <div className="flex md:h-screen md:overflow-hidden gap-0">
                                <CommandPalette />
                                <KeyboardShortcutsDialog />
                                <KeyboardShortcuts />
                                <MobileZoomControl />
                                <Sidebar
                                    foundryName={foundryName}
                                    foundryId={foundryId}
                                    foundryLogoUrl={foundryLogoUrl}
                                    foundryIsSandbox={foundryIsSandbox}
                                    userName={profile?.full_name || user.email || "User"}
                                    userRole={profile?.role || "Member"}
                                    isCompanyAdmin={
                                        profile?.role === "Founder" ||
                                        profile?.role === "Executive" ||
                                        hasAdminAccess
                                    }
                                    userFoundries={userFoundries}
                                    onboardingData={
                                        (profile?.onboarding_data as Record<string, unknown>) ||
                                        undefined
                                    }
                                    isSupplier={
                                        !!(profile as unknown as Record<string, unknown>)
                                            ?.is_supplier
                                    }
                                    newForgeExperienceEnabled={newForgeExperienceEnabled}
                                />
                                <MainContentArea>
                                    <ActiveTimerBar />
                                    <main className="p-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:py-6 sm:pr-6 sm:pl-5 sm:pt-6 lg:py-8 lg:pr-8 lg:pl-6 lg:pt-8 pb-24 sm:pb-8">
                                        <ErrorBoundary>{children}</ErrorBoundary>
                                    </main>
                                </MainContentArea>
                                <MobileNav
                                    foundryName={foundryName}
                                    isSupplier={
                                        !!(profile as unknown as Record<string, unknown>)
                                            ?.is_supplier
                                    }
                                />
                                <Suspense fallback={null}>
                                    <OfflineIndicator />
                                </Suspense>
                            </div>
                        </ScreenContextProvider>
                    </BrowseContextProvider>
                </ZoomProvider>
            </TooltipProvider>
        </PostHogProvider>
    )
}
