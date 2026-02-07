import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { PWARegister } from "@/components/PWARegister";
import { DragDropPolyfill } from "@/components/DragDropPolyfill";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { OnboardingModal } from "@/components/OnboardingModal";
import { ExecutiveProfilePrompt, VerificationSuccessToast } from "@/components/onboarding";
import { ActivityTracker } from "@/components/ActivityTracker";
import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PresenceProvider } from "@/components/PresenceProvider";
import { ZoomProvider, MobileZoomControl, ZoomableContent } from "@/components/ZoomProvider";
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
    let hasAdminAccess = false;

    if (profile?.foundry_id) {
        foundryId = profile.foundry_id;
        const { data: foundry, error: foundryError } = await supabase
            .from("foundries")
            .select("name")
            .eq("id", profile.foundry_id)
            .maybeSingle();

        if (foundryError) {
            console.error("Failed to fetch foundry:", foundryError.message);
        }

        if (foundry) {
            foundryName = foundry.name;
        }

        // Check for admin permissions (non-Founders only)
        // Note: foundry_admin_permissions table is new and may not be in generated types yet
        if (profile.role !== "Founder") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: adminPerm } = await (supabase as any)
                .from("foundry_admin_permissions")
                .select("id")
                .eq("foundry_id", profile.foundry_id)
                .eq("profile_id", user.id)
                .maybeSingle();
            
            hasAdminAccess = !!adminPerm;
        }
    }

    return (
        <TooltipProvider>
            <PresenceProvider>
                <ZoomProvider>
                    <div className="flex h-screen overflow-hidden">
                        <CommandPalette />
                        <KeyboardShortcutsDialog />
                        <MobileZoomControl />
                        <Sidebar foundryName={foundryName} foundryId={foundryId} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} isAdmin={profile?.role === "Founder" || profile?.role === "Executive" || hasAdminAccess} userFoundries={userFoundries} />
                        <ZoomableContent className="flex-1 overflow-y-auto bg-background">
                            <main className="p-4 sm:p-6 lg:p-8 pb-32 lg:pb-8">
                                <ErrorBoundary>
                                    {children}
                                </ErrorBoundary>
                            </main>
                        </ZoomableContent>
                        <MobileNav />
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
                </ZoomProvider>
            </PresenceProvider>
        </TooltipProvider>
    );
}