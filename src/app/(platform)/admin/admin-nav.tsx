'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
    LayoutDashboard, 
    ClipboardList, 
    Activity, 
    FlaskConical,
    BarChart3,
    Shield,
    Settings,
    Info
} from "lucide-react"

const adminNavigation = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Applications", href: "/admin/applications", icon: ClipboardList },
    { name: "Platform Health", href: "/admin/health", icon: Activity },
    { name: "QA Testing", href: "/admin/qa", icon: FlaskConical },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "GDPR", href: "/admin/gdpr", icon: Shield },
    { name: "Settings", href: "/admin/settings", icon: Settings },
    { name: "About", href: "/admin/about", icon: Info },
]

export function AdminNav() {
    const pathname = usePathname()

    return (
        <nav className="flex items-center gap-1 overflow-x-auto pb-0 border-b border-slate-100 -mt-2">
            {adminNavigation.map((item) => {
                const isActive = item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.href)

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px whitespace-nowrap transition-colors",
                            isActive
                                ? "border-b-2 border-international-orange text-foreground"
                                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive && "text-international-orange")} />
                        {item.name}
                    </Link>
                )
            })}
        </nav>
    )
}
