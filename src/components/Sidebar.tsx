"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Users, CheckSquare, Store, Target, ShieldAlert, Settings, Lightbulb, ShoppingBag, Bot, Home, Bell } from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { UnreadIndicator } from "@/components/today/UnreadIndicator"
// ThemeToggle removed - ForgeOS enforces light mode per design philosophy
import { FocusModeToggle } from "@/components/FocusModeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NewBadge } from "@/components/ui/new-badge"

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

// Work: day-to-day operations
const workNavigation = [
    { name: "Home", href: "/dashboard", icon: Home, tooltip: "Your personalized command center with insights and quick actions" },
    { name: "Updates", href: "/updates", icon: Bell, tooltip: "Notes, comments, and changes across your tasks and objectives" },
    { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Set and track high-level strategic goals" },
    { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Manage and assign actionable items" },
    { name: "Team", href: "/team", icon: Users, tooltip: "Team members, roles, and capacity" },
    { name: "Agents", href: "/agents", icon: Bot, tooltip: "AI prompt workflows — build, chain, and copy prompts" },
]

// Discovery: finding help and resources
const discoveryNavigation = [
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb, tooltip: "Get ideas on what to do next and discover opportunities" },
    { name: "Marketplace", href: "/marketplace-v2", icon: Store, tooltip: "Find experts, suppliers, products, and services" },
    { name: "My Orders", href: "/my-orders", icon: ShoppingBag, tooltip: "View and manage your marketplace orders" },
]

// Settings only - accessible but not prominent
const settingsNavigation = [
    { name: "Settings", href: "/settings", icon: Settings, tooltip: "Account and app settings" },
]

export function Sidebar({ foundryName, foundryId, userName, userRole, isAdmin }: { foundryName?: string; foundryId?: string; userName?: string; userRole?: string; isAdmin?: boolean }) {
    const pathname = usePathname()
    const { setZoom } = useZoomContext()

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-background border-r border-slate-100 text-foreground">
            {/* App Header - Centaur Dynamics Branding */}
            <div className="px-5 pt-8 pb-6">
                <div className="flex items-center justify-between">
                    <Link href="/dashboard" className="group flex items-center gap-2">
                        <span className="font-display text-xl font-bold tracking-[0.05em] text-foreground group-hover:text-international-orange transition-colors">
                            ForgeOS
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse shadow-[0_0_8px_rgba(255,69,0,0.6)]"></span>
                    </Link>
                    <div className="flex items-center gap-0.5">
                        <FocusModeToggle compact />
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
                    <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide">
                        {userRole || "Member"}
                    </span>
                </div>
                {/* Unread messages indicator */}
                <div className="mt-3">
                    <UnreadIndicator />
                </div>
            </div>

            <nav className="flex-1 space-y-1.5 px-3 py-3">
                {/* Helper function to render nav items */}
                {(() => {
                    const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string }) => {
                        const isActive = isRouteActive(pathname, item.href)
                        
                        // Determine which badge to show
                        let badgeContent = null
                        
                        if (item.href === '/inspiration' || item.href === '/marketplace-v2') {
                            // Show "Demo" badge for Inspiration and Marketplace
                            badgeContent = <NewBadge customText="Demo" />
                        } else if (item.href !== '/objectives' && item.href !== '/settings') {
                            // Show "New" badge only for routes other than objectives and settings
                            badgeContent = <NewBadge route={item.href} />
                        }
                        
                        const navLink = (
                            <Link
                                href={item.href}
                                className={cn(
                                    isActive
                                        ? "bg-orange-50 text-international-orange font-semibold"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    "group flex items-center justify-between px-3 py-2.5 text-sm transition-all duration-200 rounded-md"
                                )}
                            >
                                <span className="flex items-center">
                                    <item.icon
                                        className={cn(
                                            isActive ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                        )}
                                        aria-hidden="true"
                                    />
                                    {item.name}
                                </span>
                                {badgeContent}
                            </Link>
                        )

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
                    }

                    return (
                        <>
                            {/* Work: Home, Objectives, Tasks, Team */}
                            {workNavigation.map(renderNavItem)}
                            
                            {/* Spacer */}
                            <div className="my-3 border-t border-slate-100" />
                            
                            {/* Discovery: Product Map, Marketplace */}
                            {discoveryNavigation.map(renderNavItem)}
                            
                            {/* Spacer */}
                            <div className="my-3 border-t border-slate-100" />
                            
                            {/* Settings */}
                            {settingsNavigation.map(renderNavItem)}
                        </>
                    )
                })()}

                {/* System Admin Link - Only visible to admins */}
                {isAdmin && (
                    <>
                        <div className="my-4 border-t border-slate-100" />
                        <Link
                            href="/admin"
                            className={cn(
                                isRouteActive(pathname, "/admin")
                                    ? "bg-orange-50 text-international-orange font-semibold"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                "group flex items-center px-3 py-2.5 text-sm transition-all duration-200 rounded-md"
                            )}
                        >
                            <ShieldAlert
                                className={cn(
                                    isRouteActive(pathname, "/admin") ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                )}
                                aria-hidden="true"
                            />
                            System Admin
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
