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
            .select("foundry_id, active_foundry_id, full_name, role, account_type")
            .eq("id", user.id)
            .single(),
        getUserFoundries(),
    ]);

    const { data: profile, error: profileError } = profileResult;

    if (profileError) {
        console.error("Failed to fetch user profile:", profileError.message);
    }

    let foundryName = "Forge Foundry";
    let foundryId = "Unknown";
    let foundryLogoUrl: string | null = null;
    let hasAdminAccess = false;

    if (profile?.foundry_id) {
        foundryId = profile.foundry_id;
        const { data: foundry, error: foundryError } = await supabase
            .from("foundries")
            .select("name, logo_url")
            .eq("id", profile.foundry_id)
            .maybeSingle();

        if (foundryError) {
            console.error("Failed to fetch foundry:", foundryError.message);
        }

        if (foundry) {
            foundryName = foundry.name;
            foundryLogoUrl = foundry.logo_url || null;
        }

        // Check for admin permissions (non-Founders only)
        // Note: foundry_admin_permissions table is new and may not be in generated types yet
        if (profile.role !== "Founder") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: adminPerm } = await supabase
                .from("foundry_admin_permissions")
                .select("id")
                .eq("foundry_id", profile.foundry_id)
                .eq("profile_id", user.id)
                .maybeSingle();
            
            hasAdminAccess = !!adminPerm;
        }
    }

    // Resolve the active foundry display name from multi-foundry data
    // This is more reliable than the legacy foundryName for switched workspaces
    const activeFoundry = userFoundries.find(f => f.isActive)
    const activeFoundryDisplayName = activeFoundry?.foundryName || foundryName

    return (
        <TooltipProvider>
            <PresenceProvider>
                <ZoomProvider>
                  <ScreenContextProvider>
                    <div className="flex h-screen overflow-hidden">
                        <CommandPalette />
                        <KeyboardShortcutsDialog />
                        <MobileZoomControl />
                        <Sidebar foundryName={foundryName} foundryId={foundryId} foundryLogoUrl={foundryLogoUrl} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} isCompanyAdmin={profile?.role === "Founder" || profile?.role === "Executive" || hasAdminAccess} userFoundries={userFoundries} />
                        <ZoomableContent className="flex-1 overflow-y-auto bg-background">
                            <main className="p-4 pt-14 sm:p-6 lg:p-8 pb-32 sm:pb-8">
                                <WelcomeBackBanner userName={profile?.full_name || user.email || "builder"} />
                                <ErrorBoundary>
                                    {children}
                                </ErrorBoundary>
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
                        <OnboardingModal userRole={profile?.role} accountType={profile?.account_type} />
                        <ExecutiveProfilePrompt userRole={profile?.role} />
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