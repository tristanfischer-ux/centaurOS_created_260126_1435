"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, CheckSquare, Clock, Store, Target, Compass, LayoutGrid, MessageCircleQuestion, ShieldAlert } from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { ThemeToggle } from "@/components/ThemeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Determines if a navigation item should be marked as active
 * Uses exact matching for root routes and prefix matching for nested routes
 */
function isRouteActive(pathname: string, href: string): boolean {
    // Exact match for root-level routes
    if (pathname === href) return true

    // For nested routes, check if pathname starts with href followed by /
    // This prevents /dashboard from matching /dashboard-settings
    if (pathname.startsWith(href + '/')) return true

    return false
}

// Keep in sync with package.json version
const APP_VERSION = "1.0.3"

const mainNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Org Blueprint", href: "/org-blueprint", icon: LayoutGrid, tooltip: "Business function coverage and gap analysis" },
    { name: "Advisory", href: "/advisory", icon: MessageCircleQuestion, tooltip: "Ask questions and get expert guidance" },
    { name: "Objectives", href: "/objectives", icon: Target },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Team", href: "/team", icon: Users },
    { name: "Timeline", href: "/timeline", icon: Clock, tooltip: "Gantt chart view of all tasks" },
    { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Browse and compare service providers" },
    { name: "Guild", href: "/guild", icon: Compass, tooltip: "Community events and resources" },
]

export function Sidebar({ foundryName, foundryId, userName, userRole, isAdmin }: { foundryName?: string; foundryId?: string; userName?: string; userRole?: string; isAdmin?: boolean }) {
    const pathname = usePathname()
    const { setZoom } = useZoomContext()

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-white border-r border-slate-100 text-slate-900">
            {/* App Header - Centaur Dynamics Branding */}
            <div className="px-5 pt-8 pb-6">
                <div className="flex items-center justify-between">
                    <Link href="/dashboard" className="group flex items-center gap-2">
                        <span className="font-display text-xl font-bold tracking-[0.05em] text-cyan-950 group-hover:text-cyan-700 transition-colors">
                            CentaurOS
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span>
                    </Link>
                    <div className="flex items-center gap-0.5">
                        <ThemeToggle />
                        <NotificationCenter />
                    </div>
                </div>
            </div>

            {/* Foundry & User Info - Combined */}
            <div className="px-4 pb-4">
                <div className="text-sm font-semibold text-foreground uppercase tracking-wider truncate">
                    {foundryName || "Centaur Inc."}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5 tracking-wide">
                    {foundryId || "Loading..."}
                </div>
                <div className="mt-3 flex items-center gap-2">
                    <div className="text-sm text-muted-foreground truncate">
                        {userName || "Loading..."}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono uppercase px-1.5 py-0.5 bg-muted">
                        {userRole || "Member"}
                    </span>
                </div>
            </div>

            <nav className="flex-1 space-y-0.5 px-3 py-2">
                {mainNavigation.map((item) => {
                    const isActive = isRouteActive(pathname, item.href)
                    const navLink = (
                        <Link
                            href={item.href}
                            className={cn(
                                isActive
                                    ? "bg-cyan-50 text-cyan-900 font-semibold"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                                "group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-md"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    isActive ? "text-cyan-600" : "text-slate-400 group-hover:text-slate-600",
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )

                    // Wrap with tooltip if item has a tooltip description
                    if (item.tooltip) {
                        return (
                            <Tooltip key={item.name} delayDuration={300}>
                                <TooltipTrigger asChild>
                                    {navLink}
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[200px]">
                                    <p>{item.tooltip}</p>
                                </TooltipContent>
                            </Tooltip>
                        )
                    }

                    return <div key={item.name}>{navLink}</div>
                })}

                {/* Admin Panel Link - Only visible to admins */}
                {isAdmin && (
                    <>
                        <div className="my-4 border-t border-slate-100" />
                        <Link
                            href="/admin"
                            className={cn(
                                isRouteActive(pathname, "/admin")
                                    ? "bg-cyan-50 text-cyan-900 font-semibold"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                                "group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-md"
                            )}
                        >
                            <ShieldAlert
                                className={cn(
                                    isRouteActive(pathname, "/admin") ? "text-cyan-600" : "text-slate-400 group-hover:text-slate-600",
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                )}
                                aria-hidden="true"
                            />
                            Admin Panel
                        </Link>
                    </>
                )}
            </nav>

            <div className="p-4 mt-auto space-y-3">
                {/* Zoom Control */}
                <div className="flex justify-center">
                    <ZoomControl onZoomChange={setZoom} />
                </div>

                {/* Version info */}
                <div className="text-[10px] text-muted-foreground text-center font-mono tracking-wider opacity-50">
                    <kbd className="px-1 py-0.5 bg-muted text-[9px]">⌘K</kbd> search · v{APP_VERSION}
                </div>
            </div>
        </div>
    )
}
