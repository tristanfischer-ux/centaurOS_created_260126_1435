import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { isAdmin } from "@/lib/admin/access"
import { ShieldAlert, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminNav } from "./admin-nav"

export default async function AdminLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect("/login")
    }
    
    // Check admin access
    const hasAdminAccess = await isAdmin(user.id)
    
    if (!hasAdminAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <div className="p-4 rounded-full bg-status-error-light mb-4">
                    <ShieldAlert className="h-12 w-12 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                    Access Denied
                </h1>
                <p className="text-muted-foreground mb-6 max-w-md">
                    You do not have permission to access the admin dashboard. 
                    Please contact a platform administrator if you believe this is an error.
                </p>
                <Link href="/dashboard">
                    <Button variant="secondary">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Return to Dashboard
                    </Button>
                </Link>
            </div>
        )
    }
    
    return (
        <div className="flex flex-col gap-6">
            {/* Admin Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <ShieldAlert className="h-4 w-4 text-international-orange" />
                                <span className="text-xs font-medium text-international-orange uppercase tracking-wider">
                                    Admin Panel
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                                Operations Dashboard
                            </h1>
                        </div>
                    </div>
                </div>
                <Link href="/updates">
                    <Button variant="outline" size="sm" className="border-slate-200 hover:bg-slate-50">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to App
                    </Button>
                </Link>
            </div>
            
            {/* Admin Navigation - Client component for active state */}
            <AdminNav />
            
            {/* Content */}
            <div className="flex-1">
                {children}
            </div>
        </div>
    )
}
