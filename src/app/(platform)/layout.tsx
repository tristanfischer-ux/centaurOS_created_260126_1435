import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
// ContextIndicator removed — banners no longer shown at page top
import { PWARegister } from "@/components/PWARegister";
import { DragDropPolyfill } from "@/components/DragDropPolyfill";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { OnboardingModal } from "@/components/OnboardingModal";
import { WelcomeBackBanner } from "@/components/WelcomeBackBanner";
import { ExecutiveProfilePrompt, VerificationSuccessToast } from "@/components/onboarding";
import { ActivityTracker } from "@/components/ActivityTracker";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PresenceProvider } from "@/components/PresenceProvider";
import { ZoomProvider, MobileZoomControl, ZoomableContent } from "@/components/ZoomProvider";
import { ScreenContextProvider } from "@/contexts/screen-context";
import { FloatingSpecialistFAB } from "@/components/specialists/floating-specialist-fab";
import { ProfileSetupRequired } from "@/components/ProfileSetupRequired";
import { createClient } from "@/lib/supabase/server";
import { getUserFoundries } from "@/lib/supabase/foundry-context";
import { redirect } from "next/navigation";

export default async function PlatformLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // Fetch profile and foundry memberships in parallel
    const [profileResult, userFoundries] = await Promise.all([
        supabase
            .from("profiles")
            .select("foundry_id, active_foundry_id, full_name, role, account_type, onboarding_data")
            .eq("id", user.id)
            .single(),
        getUserFoundries(),
    ]);

    let { data: profile, error: profileError } = profileResult;

    // If the regular profile query fails (e.g. RLS 500), attempt auto-repair
    // via the SECURITY DEFINER RPC. This transparently fixes broken profiles
    // without showing the user a manual "Complete Setup" screen.
    if (profileError) {
        console.warn("[PlatformLayout] Profile query failed, attempting auto-repair:", profileError.message);

        const { data: rpcResult, error: rpcError } = await supabase.rpc("repair_user_profile");

        if (!rpcError && rpcResult?.success && rpcResult?.foundry_id) {
            console.info("[PlatformLayout] Auto-repair succeeded:", rpcResult);

            // Re-fetch the profile now that it's been repaired
            const { data: repairedProfile, error: refetchError } = await supabase
                .from("profiles")
                .select("foundry_id, active_foundry_id, full_name, role, account_type, onboarding_data")
                .eq("id", user.id)
                .single();

            if (!refetchError && repairedProfile) {
                profile = repairedProfile;
                profileError = null;
            } else {
                // The re-fetch also failed (persistent RLS issue). Construct a
                // minimal profile from auth metadata + RPC result so the layout
                // can render. This prevents the repair screen from looping.
                console.warn("[PlatformLayout] Re-fetch failed, using fallback profile:", refetchError?.message);
                const meta = user.user_metadata ?? {};
                profile = {
                    foundry_id: rpcResult.foundry_id as string,
                    active_foundry_id: rpcResult.foundry_id as string,
                    full_name: (meta.full_name as string) ?? user.email?.split("@")[0] ?? "User",
                    role: (meta.role as string) ?? "Apprentice",
                    account_type: "team_builder" as const,
                    onboarding_data: null,
                };
                profileError = null;
            }
        } else {
            console.error("[PlatformLayout] Auto-repair failed:", rpcError?.message ?? rpcResult?.error);
        }
    }

    let foundryName = "Forge Foundry";
    let foundryId = "Unknown";
    let foundryLogoUrl: string | null = null;
    let hasAdminAccess = false;

    // PERF: Fetch foundry details and admin permissions in parallel
    // (previously sequential — saved ~50-100ms)
    if (profile?.foundry_id) {
        foundryId = profile.foundry_id;

        const needsAdminCheck = profile.role !== "Founder";

        const [foundryResult, adminPermResult] = await Promise.all([
            supabase
                .from("foundries")
                .select("name, logo_url")
                .eq("id", profile.foundry_id)
                .maybeSingle(),
            needsAdminCheck
                ? supabase
                    .from("foundry_admin_permissions")
                    .select("id")
                    .eq("foundry_id", profile.foundry_id)
                    .eq("profile_id", user.id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null }),
        ]);

        if (foundryResult.error) {
            console.error("Failed to fetch foundry:", foundryResult.error.message);
        }

        if (foundryResult.data) {
            foundryName = foundryResult.data.name;
            foundryLogoUrl = foundryResult.data.logo_url || null;
        }

        hasAdminAccess = !!adminPermResult.data;
    }

    // Resolve the active foundry display name from multi-foundry data
    // This is more reliable than the legacy foundryName for switched workspaces
    const activeFoundry = userFoundries.find(f => f.isActive)
    const activeFoundryDisplayName = activeFoundry?.foundryName || foundryName

    // GUARD: If user has no valid foundry, show recovery screen instead of page content.
    // The sidebar still renders so the user isn't completely disoriented.
    const needsProfileRepair = !profile?.foundry_id

    return (
        <TooltipProvider>
            <PresenceProvider>
                <ZoomProvider>
                  <ScreenContextProvider>
                    <div className="flex h-screen overflow-hidden">
                        <CommandPalette />
                        <KeyboardShortcutsDialog />
                        <MobileZoomControl />
                        <Sidebar foundryName={foundryName} foundryId={foundryId} foundryLogoUrl={foundryLogoUrl} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} isCompanyAdmin={profile?.role === "Founder" || profile?.role === "Executive" || hasAdminAccess} userFoundries={userFoundries} onboardingData={(profile?.onboarding_data as Record<string, unknown>) || undefined} />
                        <ZoomableContent className="flex-1 overflow-y-auto bg-background">
                            <main className="p-4 pt-14 sm:p-6 lg:p-8 pb-32 sm:pb-8">
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
                        </ZoomableContent>
                        <MobileNav />
                        <Suspense fallback={null}>
                            <FloatingSpecialistFAB />
                        </Suspense>
                        <PWARegister />
                        <DragDropPolyfill />
                        <OfflineIndicator />
                        <ActivityTracker />
                        {!needsProfileRepair && (
                            <>
                                <OnboardingModal userRole={profile?.role} accountType={profile?.account_type} />
                                <ExecutiveProfilePrompt userRole={profile?.role} />
                            </>
                        )}
                        <Suspense fallback={null}>
                            <VerificationSuccessToast />
                        </Suspense>
                    </div>
                  </ScreenContextProvider>
                </ZoomProvider>
            </PresenceProvider>
        </TooltipProvider>
    );
}