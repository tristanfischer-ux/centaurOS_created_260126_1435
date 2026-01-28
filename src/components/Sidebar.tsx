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

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-muted text-foreground border-r border-border">
            {/* App Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border bg-card">
                <div className="font-bold text-xl tracking-wider uppercase text-amber-600">
                    Centaur App
                </div>
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    <FocusModeToggle compact />
                    {(userRole === 'Executive' || userRole === 'Founder') && (
                        <PendingApprovalsButton />
                    )}
                    <NotificationCenter />
                </div>
            </div>
            
            {/* Foundry Info */}
            <div className="px-4 py-4 border-b border-border bg-card">
                <div className="text-sm font-semibold text-foreground uppercase tracking-wide truncate">
                    {foundryName || "Centaur Inc."}
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                    {foundryId || "ID: Loading..."}
                </div>
            </div>
            
            {/* Current User */}
            <div className="px-4 py-4 border-b border-border bg-muted">
                <div className="text-sm font-medium text-foreground truncate">
                    {userName || "Loading..."}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                    {userRole || "Member"}
                </div>
            </div>
            <nav className="flex-1 space-y-1 px-2 py-4">
                {mainNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                isActive
                                    ? "bg-card text-amber-600 shadow-sm border border-border"
                                    : "text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm active:bg-muted",
                                "group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all duration-200"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    isActive ? "text-amber-500" : "text-muted-foreground group-hover:text-amber-500",
                                    "mr-3 h-5 w-5 flex-shrink-0"
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>
            <div className="border-t border-border p-4">
                <div className="flex items-center mb-2">
                    {/* Placeholder for user profile */}
                    <div className="h-8 w-8 rounded-full bg-muted-foreground/20"></div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-foreground">User</p>
                        <p className="text-xs text-muted-foreground">Foundry Member</p>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground px-2 py-2 border-t border-border mt-2 pt-2 text-center">
                    Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono border border-border">⌘K</kbd> to search
                </div>
                <div className="text-[10px] text-muted-foreground text-center font-mono mt-2">
                    v{APP_VERSION}
                </div>
            </div>
        </div>
    )
}
