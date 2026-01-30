import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { PWARegister } from "@/components/PWARegister";
import { DragDropPolyfill } from "@/components/DragDropPolyfill";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { OnboardingModal } from "@/components/OnboardingModal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PresenceProvider } from "@/components/PresenceProvider";
import { ZoomProvider, MobileZoomControl, ZoomableContent } from "@/components/ZoomProvider";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/access";

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

    // Fetch profile to get foundry_id and user info
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("foundry_id, full_name, role")
        .eq("id", user.id)
        .single();

    if (profileError) {
        console.error("Failed to fetch user profile:", profileError.message);
    }

    let foundryName = "Centaur Foundry";
    let foundryId = "Unknown";

    if (profile?.foundry_id) {
        foundryId = profile.foundry_id;
        const { data: foundry, error: foundryError } = await supabase
            .from("foundries")
            .select("name")
            .eq("id", profile.foundry_id)
            .single();

        if (foundryError) {
            console.error("Failed to fetch foundry:", foundryError.message);
        }

        if (foundry) {
            foundryName = foundry.name;
        }
    }

    // Check if user has admin access
    const userIsAdmin = await isAdmin(user.id);

    return (
        <TooltipProvider>
            <PresenceProvider>
                <ZoomProvider>
                    <div className="flex h-screen overflow-hidden">
                        <CommandPalette />
                        <KeyboardShortcutsDialog />
                        <MobileZoomControl />
                        <Sidebar foundryName={foundryName} foundryId={foundryId} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} isAdmin={userIsAdmin} />
                        <ZoomableContent className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
                            {/* 
                              Responsive padding:
                              - xs (320px): p-4 - Small phones
                              - sm (640px): p-5 - Standard mobile
                              - fold (653px): p-6 - Galaxy Fold inner
                              - lg (1024px): p-8 - Desktop
                              
                              Bottom padding accounts for mobile nav height (64px + safe area)
                              Explicit right padding ensures content doesn't touch screen edge
                            */}
                            <main className="p-4 xs:p-4 sm:p-5 fold:p-6 lg:p-8 pb-24 xs:pb-28 sm:pb-32 lg:pb-8 pr-4 sm:pr-5 fold:pr-6 lg:pr-8">
                                <ErrorBoundary>
                                    {children}
                                </ErrorBoundary>
                            </main>
                        </ZoomableContent>
                        <MobileNav />
                        <PWARegister />
                        <DragDropPolyfill />
                        <OfflineIndicator />
                        <OnboardingModal />
                    </div>
                </ZoomProvider>
            </PresenceProvider>
        </TooltipProvider>
    );
}
