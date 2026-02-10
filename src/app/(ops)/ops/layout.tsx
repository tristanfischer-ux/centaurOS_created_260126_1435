import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { isAdmin } from "@/lib/admin/access"
import { OpsNav } from "./ops-nav"

/**
 * Platform Operations Layout
 * 
 * @description Standalone layout for the ops subdomain (ops.centauros.io).
 * Completely separate from the main platform layout -- no sidebar, no
 * foundry context, no user-facing navigation.
 * 
 * @security Only accessible to platform administrators (admin_users table
 * or PLATFORM_SUPER_ADMIN_EMAIL env var). The ops subdomain is also
 * blocked on the main domain via middleware.
 */
export default async function OpsLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect("/login")
    }
    
    // AUTH: Strict platform admin check (no Founder fallback)
    const hasAccess = await isAdmin(user.id)
    
    if (!hasAccess) {
        // SECURITY: Don't reveal this area exists -- just redirect to main app
        redirect("/updates")
    }
    
    return (
        <div className="min-h-screen bg-background">
            {/* Ops Header */}
            <header className="border-b border-slate-200 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-14">
                        <div className="flex items-center gap-3">
                            <div className="h-6 w-1 bg-international-orange rounded-full" />
                            <span className="font-display font-semibold text-foreground tracking-tight">
                                Platform Operations
                            </span>
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                INTERNAL
                            </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {user.email}
                        </span>
                    </div>
                </div>
            </header>
            
            {/* Ops Navigation */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                <OpsNav />
            </div>
            
            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
            </main>
        </div>
    )
}
