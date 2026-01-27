import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { PWARegister } from "@/components/PWARegister";
import { DragDropPolyfill } from "@/components/DragDropPolyfill";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { createClient } from "@/lib/supabase/server";
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

    // Fetch profile to get foundry_id and user info
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id, full_name, role")
        .eq("id", user.id)
        .single();

    let foundryName = "Centaur Foundry";
    let foundryId = "Unknown";

    if (profile?.foundry_id) {
        foundryId = profile.foundry_id;
        const { data: foundry } = await supabase
            .from("foundries")
            .select("name")
            .eq("id", profile.foundry_id)
            .single();

        if (foundry) {
            foundryName = foundry.name;
        }
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <CommandPalette />
            <KeyboardShortcutsDialog />
            <Sidebar foundryName={foundryName} foundryId={foundryId} userName={profile?.full_name || user.email || "User"} userRole={profile?.role || "Member"} />
            <main className="flex-1 overflow-y-auto bg-white p-4 sm:p-6 lg:p-8 pb-32 lg:pb-8">
                {children}
            </main>
            <MobileNav />
            <PWARegister />
            <DragDropPolyfill />
        </div>
    );
}
