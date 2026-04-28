/**
 * @file (public-investors)/layout.tsx
 *
 * @description Layout for routes that allow unauthenticated visitors but
 * still need authenticated-user features when a session is present. Used
 * by /investors per RED-TEAM-PIVOT-PLAN Tier 2 step 14 — the page renders
 * the curated teaser variant for anonymous visitors and the full directory
 * for authenticated users.
 *
 * The (platform) layout enforces login redirect at the top, which makes
 * /investors unreachable for anonymous visitors. Splitting /investors out
 * to its own route group is the cleanest way to allow that path through
 * without weakening the platform-wide auth gate. The deep dive
 * /investors/[id] remains under (platform) so it stays auth-required.
 *
 * For authenticated users, the page itself fetches sidebar/profile data
 * and renders inside this minimal shell — without the sidebar. Founders
 * already inside the platform expect to see the sidebar, so we render the
 * full platform chrome only when there is a user. When there is no user,
 * we render a marketing-style top bar.
 *
 * @security Public — no auth check at the layout level. Page-level data
 * fetches still gate tier-aware fields server-side.
 */

import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ZoomProvider } from "@/components/ZoomProvider";
import { ScreenContextProvider } from "@/contexts/screen-context";
import { BrowseContextProvider } from "@/contexts/browse-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PostHogProvider } from "@/components/PostHogProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { MainContentArea } from "@/components/MainContentArea";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ActiveTimerBar } from "@/components/time/active-timer-bar";
import { createClient } from "@/lib/supabase/server";
import { getCachedLayoutData } from "@/lib/supabase/cached-layout-data";
import { getFeatureFlag } from "@/lib/features/flags";
import { FLAG_NEW_FORGE_EXPERIENCE } from "@/lib/features/keys";

// Match the (platform) layout's caps — server actions called from /investors
// (search, match enrichment) need the same 300s budget on Vercel.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default async function PublicInvestorsLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

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
        );
    }

    // ── Authenticated visitor ────────────────────────────────────────
    // Mirror the (platform) layout chrome so a logged-in founder sees the
    // same sidebar / nav / command palette they would on /today, /agents
    // etc. The deep dive /investors/[id] is still inside (platform) so the
    // chrome there is unchanged — this layout is only the top-level page.
    const layoutData = await getCachedLayoutData(user.id);
    const { profile } = layoutData;
    const {
        foundryName,
        foundryId,
        foundryLogoUrl,
        foundryIsSandbox,
        hasAdminAccess,
        userFoundries,
    } = layoutData;

    const newForgeExperienceEnabled = await getFeatureFlag(
        supabase,
        user.id,
        FLAG_NEW_FORGE_EXPERIENCE,
    );

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
    );
}
