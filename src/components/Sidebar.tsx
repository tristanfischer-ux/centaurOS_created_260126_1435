"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
// We'll replace these with Lucide icons later if needed, or maintain text/emoji
import { LayoutDashboard, Users, CheckSquare, Clock, Store, Settings, Target, HelpCircle } from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { PendingApprovalsButton } from "@/components/BatchApprovalSheet"
import { FocusModeToggle } from "@/components/FocusModeToggle"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/ThemeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"

// Keep in sync with package.json version
const APP_VERSION = "1.0.3"

const mainNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Objectives", href: "/objectives", icon: Target },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Team", href: "/team", icon: Users },
    { name: "Timeline", href: "/timeline", icon: Clock, tooltip: "Gantt chart view of all tasks" },
    { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Browse and compare service providers" },
]

const bottomNavigation = [
    { name: "Help", href: "/help", icon: HelpCircle },
    { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar({ foundryName, foundryId, userName, userRole }: { foundryName?: string; foundryId?: string; userName?: string; userRole?: string }) {
    const pathname = usePathname()
    const { setZoom } = useZoomContext()

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-card text-foreground">
            {/* App Header - Centaur Dynamics Branding */}
            <div className="px-4 pt-5 pb-4">
                <div className="flex items-center justify-between">
                    <Link href="/dashboard" className="group flex items-center gap-2">
                        <span className="font-display text-xl font-bold tracking-[0.12em] uppercase text-international-orange group-hover:text-international-orange-hover transition-colors">
                            CentaurOS
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse"></span>
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

            <nav className="flex-1 space-y-0.5 px-2 py-2">
                {mainNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                isActive
                                    ? "bg-international-orange/10 text-international-orange"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                "group flex items-center px-3 py-2.5 text-sm font-medium transition-all duration-150"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    isActive ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 mt-auto">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 bg-muted flex items-center justify-center">
                        <span className="text-xs font-mono text-muted-foreground">
                            {userName?.charAt(0)?.toUpperCase() || "U"}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{userName || "User"}</p>
                        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{userRole || "Member"}</p>
                    </div>
                    <FocusModeToggle compact />
                    {(userRole === 'Executive' || userRole === 'Founder') && (
                        <PendingApprovalsButton />
                    )}
                </div>
                {/* Zoom Control */}
                <div className="flex justify-center mb-3">
                    <ZoomControl onZoomChange={setZoom} />
                </div>
                <div className="text-[10px] text-muted-foreground text-center font-mono tracking-wider opacity-50">
                    <kbd className="px-1 py-0.5 bg-muted text-[9px]">⌘K</kbd> search · v{APP_VERSION}
                </div>
            </div>
        </div>
    )
}
