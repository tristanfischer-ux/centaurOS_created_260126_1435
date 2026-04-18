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
    Info,
    Flag
} from "lucide-react"

/**
 * Navigation for the Platform Operations dashboard.
 * 
 * @description All links use /ops/... paths which map to the internal
 * file system routes. On the ops subdomain, these resolve correctly
 * via middleware.
 */
const opsNavigation = [
    { name: "Overview", href: "/ops", icon: LayoutDashboard },
    { name: "Applications", href: "/ops/applications", icon: ClipboardList },
    { name: "Platform Health", href: "/ops/health", icon: Activity },
    { name: "QA Testing", href: "/ops/qa", icon: FlaskConical },
    { name: "Analytics", href: "/ops/analytics", icon: BarChart3 },
    { name: "Supplier Corrections", href: "/ops/supplier-corrections", icon: Flag },
    { name: "GDPR", href: "/ops/gdpr", icon: Shield },
    { name: "Settings", href: "/ops/settings", icon: Settings },
    { name: "About", href: "/ops/about", icon: Info },
]

export function OpsNav() {
    const pathname = usePathname()

    return (
        <nav className="flex items-center gap-1 overflow-x-auto pb-0 border-b border-slate-100">
            {opsNavigation.map((item) => {
                const isActive = item.href === '/ops'
                    ? pathname === '/ops'
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
