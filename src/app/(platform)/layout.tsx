import { Sidebar } from "@/components/sidebar/Sidebar";
import { MobileNav } from "@/components/MobileNav";
// ContextIndicator removed — banners no longer shown at page top
import { PWARegister } from "@/components/PWARegister";
import { DragDropPolyfill } from "@/components/DragDropPolyfill";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
// Tristan 2026-04-27: removed the unified onboarding tour entirely. The app
// is now simple enough that founders don't need a guided tour — the Welcome
// page covers what each section does.
import { WelcomeBackBanner } from "@/components/WelcomeBackBanner";
import { ExecutiveProfilePrompt, VerificationSuccessToast, ProfileCompletionWizard } from "@/components/onboarding";
import { ActivityTracker } from "@/components/ActivityTracker";
import { InvestorMatchPrewarmer } from "@/components/investor-match-prewarmer";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PresenceProvider } from "@/components/PresenceProvider";
import { ZoomProvider, MobileZoomControl } from "@/components/ZoomProvider";
import { MainContentArea } from "@/components/MainContentArea";
import { ScreenContextProvider } from "@/contexts/screen-context";
import { BackgroundOpsProvider } from "@/contexts/background-ops-context"
import { CadLabProvider } from "@/app/(platform)/the-forge/cad-lab/cad-lab-context";

import { PostHogProvider } from "@/components/PostHogProvider";
import { BrowseContextProvider } from "@/contexts/browse-context";
// Tristan 2026-04-27: ambient specialist UI deprecated everywhere except
// Brainstorming on /agents. FloatingSpecialistFAB mount removed below.
import { ProfileSetupRequired } from "@/components/ProfileSetupRequired";
import { BackgroundOpsIndicator } from "@/components/BackgroundOpsIndicator";
import { ActiveTimerBar } from "@/components/time/active-timer-bar";
import { createClient } from "@/lib/supabase/server";
import { getCachedLayoutData } from "@/lib/supabase/cached-layout-data";
import { redirect } from "next/navigation";
import { getFeatureFlag } from "@/lib/features/flags";
import { FLAG_NEW_FORGE_EXPERIENCE } from "@/lib/features/keys";
import { getForgeAmbassadorStatus } from "@/actions/referrals";

// DECISION: Vercel Pro caps at 300s. Server actions (research, decomposition,
// image generation) called from platform pages need up to 240s per invocation.
export const maxDuration = 300

// Platform pages are authenticated per-user surfaces — the layout itself calls
// supabase.auth.getUser() + getFeatureFlag() on every request, which means
// nothing under (platform) can be statically prerendered. Declaring
// force-dynamic at the layout level is the idempotent way to say "every page
// below this is rendered at request time" and fixes pre-existing prerender
// failures (build-time createClient() throws in Vercel's Export step when
// env vars aren't visible to static analysis). Matches the MEMORY gotcha on
// "Build-time Supabase calls — use force-dynamic or try/catch".
export const dynamic = 'force-dynamic'

export default async function PlatformLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // AUTH: Auth check runs every request (not cached) — required for security
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // PERF: All layout data (profile, foundries, permissions) is cached for 60s
    // per user. This eliminates 3-5 DB round-trips on every page navigation.
    const layoutData = await getCachedLayoutData(user.id);

    let { profile } = layoutData;
    const { foundryName, foundryId, foundryLogoUrl, foundryIsSandbox, hasAdminAccess, userFoundries } = layoutData;

    // GOTCHA: The cached path uses the admin client (bypasses RLS), so profile
    // will only be null if the row truly doesn't exist — not due to RLS failures.
    // Auto-repair is still needed for brand-new users whose profile hasn't been
    // created yet.
    if (!profile) {
        console.warn("[PlatformLayout] Profile not found, attempting auto-repair for user:", user.id);

        const { data: rpcResult, error: rpcError } = await supabase.rpc("repair_user_profile");

        const repairResult = rpcResult as Record<string, unknown> | null;
        if (!rpcError && repairResult?.success && repairResult?.foundry_id) {
            console.info("[PlatformLayout] Auto-repair succeeded:", repairResult);

            const { data: repairedProfile } = await supabase
                .from("profiles")
                .select("foundry_id, active_foundry_id, full_name, role, account_type, onboarding_data")
                .eq("id", user.id)
                .single();

            if (repairedProfile) {
                profile = repairedProfile;
            } else {
                const meta = user.user_metadata ?? {};
                profile = {
                    foundry_id: repairResult.foundry_id as string,
                    active_foundry_id: repairResult.foundry_id as string,
                    full_name: (meta.full_name as string) ?? user.email?.split("@")[0] ?? "User",
                    role: (meta.role as string) as "Executive" | "Apprentice" | "AI_Agent" | "Founder" ?? "Apprentice",
                    account_type: "team_builder" as const,
                    onboarding_data: null,
                };
            }
        } else {
            console.error("[PlatformLayout] Auto-repair failed:", rpcError?.message ?? repairResult?.error);
        }
    }

    // GUARD: If user has no valid foundry, show recovery screen instead of page content.
    const needsProfileRepair = !profile?.foundry_id

    // Phase 1 — new Forge experience flag. Gates sidebar Forge nav target.
    // Flag off (default): target /the-forge (current experience).
    // Flag on: target /the-forge-v2 (redesign routes, flag-gated, land in PR #2+).
    // Reuses the Supabase client already fetched above — no extra round-trip.
    const newForgeExperienceEnabled = await getFeatureFlag(supabase, user.id, FLAG_NEW_FORGE_EXPERIENCE)

    // FORGE AMBASSADOR: fetch in parallel with the flag above, non-blocking.
    // Passes the result to Sidebar so the badge can appear in the footer
    // without a client-side fetch. Fails open (false) if the RPC errors.
    const ambassadorResult = await getForgeAmbassadorStatus().catch(() => null)
    const isForgeAmbassador = ambassadorResult && 'isAmbassador' in ambassadorResult
      ? ambassadorResult.isAmbassador
      : false
    const ambassadorSince = ambassadorResult && 'since' in ambassadorResult
      ? ambassadorResult.since
      : null

    return (
        <PostHogProvider>
        <TooltipProvider>
            <PresenceProvider>
                <ZoomProvider>
                  <BackgroundOpsProvider>
                  <CadLabProvider>
                  <BrowseContextProvider>
                  <ScreenContextProvider>
                    <div className="flex md:h-screen md:overflow-hidden gap-0">
                        <CommandPalette />
                        <KeyboardShortcutsDialog />
                        <KeyboardShortcuts />
                        <MobileZoomControl />
                        <Sidebar foundryName={foundryName} foundryId={foundryId} foundryLogoUrl={foundryLogoUrl} foundryIsSandbox={foundryIsSandbox} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} isCompanyAdmin={profile?.role === "Founder" || profile?.role === "Executive" || hasAdminAccess} userFoundries={userFoundries} onboardingData={(profile?.onboarding_data as Record<string, unknown>) || undefined} isSupplier={!!(profile as unknown as Record<string, unknown>)?.is_supplier} newForgeExperienceEnabled={newForgeExperienceEnabled} isForgeAmbassador={isForgeAmbassador} ambassadorSince={ambassadorSince} />
                        <MainContentArea>
                            <ActiveTimerBar />
                            <main className="p-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:py-6 sm:pr-6 sm:pl-5 sm:pt-6 lg:py-8 lg:pr-8 lg:pl-6 lg:pt-8 pb-28 sm:pb-8">
                                {needsProfileRepair ? (
                                    <ProfileSetupRequired userRole={profile?.role} />
                                ) : (
                                    <>
                                        <WelcomeBackBanner userName={profile?.full_name || user.email || "builder"} />
                                        <ErrorBoundary>
                                            {children}
                                        </ErrorBoundary>
                                    </>
                                )}
                            </main>
                        </MainContentArea>
                        <MobileNav foundryName={foundryName} isSupplier={!!(profile as unknown as Record<string, unknown>)?.is_supplier} />
                        {/* FloatingSpecialistFAB removed 2026-04-27 — ambient
                            specialist UI deprecated; Brainstorming on /agents
                            keeps its own integrated UI. */}
                        <PWARegister />
                        <DragDropPolyfill />
                        <OfflineIndicator />
                        <BackgroundOpsIndicator />
                        <ActivityTracker />
                        <InvestorMatchPrewarmer />
                        {!needsProfileRepair && (
                            <>
                                <ProfileCompletionWizard
                                    open={!!((profile as unknown as Record<string, unknown>)?.is_fractional_executive && profile?.onboarding_data && typeof profile.onboarding_data === 'object' && (profile.onboarding_data as Record<string, unknown>).onboarding_modal_completed && !(profile.onboarding_data as Record<string, unknown>).profile_wizard_completed)}
                                    userRole={profile?.role ?? undefined}
                                    onboardingData={profile?.onboarding_data && typeof profile.onboarding_data === 'object' ? (profile.onboarding_data as import('@/actions/onboarding').OnboardingData) : null}
                                />
                                <ExecutiveProfilePrompt userRole={profile?.role ?? undefined} onboardingCompleted={!!(profile?.onboarding_data && typeof profile.onboarding_data === 'object' && (profile.onboarding_data as Record<string, unknown>).profile_wizard_completed)} />
                            </>
                        )}
                        <Suspense fallback={null}>
                            <VerificationSuccessToast />
                        </Suspense>
                    </div>
                  </ScreenContextProvider>
                  </BrowseContextProvider>
                  </CadLabProvider>
                  </BackgroundOpsProvider>
                </ZoomProvider>
            </PresenceProvider>
        </TooltipProvider>
        </PostHogProvider>
    );
}