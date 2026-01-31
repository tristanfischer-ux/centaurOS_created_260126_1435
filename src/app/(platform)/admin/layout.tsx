import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { isAdmin } from "@/lib/admin/access"
import { cn } from "@/lib/utils"
import { 
    LayoutDashboard, 
    ClipboardList, 
    Activity, 
    ShieldAlert,
    ArrowLeft,
    Info,
    BarChart3,
    Shield,
    Settings,
    Users
} from "lucide-react"
import { Button } from "@/components/ui/button"

const adminNavigation = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Applications", href: "/admin/applications", icon: ClipboardList },
    { name: "Platform Health", href: "/admin/health", icon: Activity },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "GDPR", href: "/admin/gdpr", icon: Shield },
    { name: "Migration", href: "/admin/migration", icon: Users },
    { name: "Settings", href: "/admin/settings", icon: Settings },
    { name: "About", href: "/admin/about", icon: Info },
]

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
                <div className="p-4 rounded-full bg-red-100 mb-4">
                    <ShieldAlert className="h-12 w-12 text-red-600" />
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldAlert className="h-5 w-5 text-international-orange" />
                        <span className="text-sm font-medium text-international-orange uppercase tracking-wider">
                            Admin Panel
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Operations Dashboard
                    </h1>
                </div>
                <Link href="/dashboard">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to App
                    </Button>
                </Link>
            </div>
            
            {/* Admin Navigation */}
            <nav className="flex items-center gap-1 overflow-x-auto pb-2">
                {adminNavigation.map((item) => (
                    <AdminNavLink key={item.href} href={item.href}>
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </AdminNavLink>
                ))}
            </nav>
            
            {/* Content */}
            <div className="flex-1">
                {children}
            </div>
        </div>
    )
}

function AdminNavLink({ 
    href, 
    children 
}: { 
    href: string
    children: React.ReactNode 
}) {
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
                "transition-colors"
            )}
        >
            {children}
        </Link>
    )
}
