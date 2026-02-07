import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ShieldAlert, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Company Admin Layout
 * 
 * @description Layout for the Company Admin hub, accessible to Founders
 * and Executives. Provides a simple header with back navigation.
 * 
 * @security Access controlled by Founder/Executive role check.
 * This is NOT the platform operations dashboard (that lives on the
 * ops subdomain with isAdmin() gating).
 */
export default async function CompanyAdminLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect("/login")
    }
    
    // AUTH: Check for Founder or Executive role (not platform admin)
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    
    const isCompanyAdmin = profile?.role === 'Founder' || profile?.role === 'Executive'
    
    if (!isCompanyAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <div className="p-4 rounded-full bg-status-error-light mb-4">
                    <ShieldAlert className="h-12 w-12 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                    Access Denied
                </h1>
                <p className="text-muted-foreground mb-6 max-w-md">
                    Only Founders and Executives can access the Company Admin area.
                    Contact your company administrator if you need access.
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
            {/* Company Admin Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <ShieldAlert className="h-4 w-4 text-international-orange" />
                                <span className="text-xs font-medium text-international-orange uppercase tracking-wider">
                                    Company Admin
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                                Administration
                            </h1>
                        </div>
                    </div>
                </div>
                <Link href="/dashboard">
                    <Button variant="outline" size="sm" className="border-slate-200 hover:bg-muted">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to App
                    </Button>
                </Link>
            </div>
            
            {/* Content */}
            <div className="flex-1">
                {children}
            </div>
        </div>
    )
}
