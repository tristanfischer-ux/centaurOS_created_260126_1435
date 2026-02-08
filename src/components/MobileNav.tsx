"use client"

import React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Users, CheckSquare, Store, Settings, Target, MoreHorizontal, Lightbulb, Bell, Home, Bot, UserCircle, LogOut, Waypoints, Plus } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NewBadge } from "@/components/ui/new-badge"
import { signOut } from "@/actions/auth"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"

import type { SmartGoalSuggestion } from "@/actions/smart-goals"

/**
 * Determines if a navigation item should be marked as active
 * Uses exact matching for root routes and prefix matching for nested routes
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) return true
    return false
}

// Simplified navigation - Primary nav items shown in bottom bar
const mainNavigation = [
    { name: "Home", shortName: "Home", href: "/dashboard", icon: Home },
    { name: "Updates", shortName: "Updates", href: "/updates", icon: Bell },
    { name: "Tasks", shortName: "Tasks", href: "/new-tasks", icon: CheckSquare },
]

// Items in the "More" dropdown - governance and discovery
const moreNavigation = [
    { name: "Team", href: "/team", icon: Users },
    { name: "Objectives", href: "/new-objectives", icon: Target },
    { name: "Agents", href: "/agents", icon: Bot },
    { name: "Canvas", href: "/canvas", icon: Waypoints },
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb },
    { name: "Marketplace", href: "/marketplace", icon: Store },
]

// Account items - personal profile and settings
const accountNavigation = [
    { name: "My Profile", href: "/my-profile", icon: UserCircle },
    { name: "Settings", href: "/settings", icon: Settings },
]

export function MobileNav() {
    const pathname = usePathname()
    const router = useRouter()
    const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false)

    const handleCaptureObjective = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-objectives?prefill=${encodeURIComponent(prefillText)}`)
    }

    const handleCaptureTask = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-tasks?prefill=${encodeURIComponent(prefillText)}`)
    }

    return (
        <>
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] md:hidden pb-safe px-safe">
            {/* Floating "+" FAB centered above the nav bar */}
            <button
                onClick={() => setIsQuickCaptureOpen(true)}
                className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center justify-center h-12 w-12 rounded-full bg-international-orange text-background shadow-lg hover:bg-international-orange-hover transition-colors active:scale-95"
                aria-label="Capture an idea"
            >
                <Plus className="h-5 w-5" />
            </button>
            <div className="flex justify-around items-center h-16">
                {mainNavigation.map((item) => {
                    const isActive = isRouteActive(pathname, item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full space-y-0.5 xs:space-y-1 touch-action-manipulation",
                                isActive ? "text-international-orange" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5 shrink-0", isActive && "fill-current")} />
                            <span className="text-[10px] xs:text-xs font-medium truncate max-w-[48px] xs:max-w-none">
                                <span className="xs:hidden">{item.shortName}</span>
                                <span className="hidden xs:inline">{item.name}</span>
                            </span>
                        </Link>
                    )
                })}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full space-y-0.5 xs:space-y-1 touch-action-manipulation",
                                [...moreNavigation, ...accountNavigation].some(item => isRouteActive(pathname, item.href))
                                    ? "text-international-orange" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MoreHorizontal className={cn("h-5 w-5 shrink-0", [...moreNavigation, ...accountNavigation].some(item => isRouteActive(pathname, item.href)) && "fill-current")} />
                            <span className="text-[10px] xs:text-xs font-medium">More</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2 mr-safe">
                        {moreNavigation.map((item) => {
                            const isActive = isRouteActive(pathname, item.href)
                            return (
                                <DropdownMenuItem key={item.name} asChild>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center justify-between gap-2 cursor-pointer w-full",
                                            isActive && "text-international-orange"
                                        )}
                                    >
                                        <span className="flex items-center gap-2">
                                            <item.icon className="h-4 w-4" />
                                            {item.name}
                                        </span>
                                        <NewBadge route={item.href} />
                                    </Link>
                                </DropdownMenuItem>
                            )
                        })}

                        <DropdownMenuSeparator />

                        {/* Account items */}
                        {accountNavigation.map((item) => {
                            const isActive = isRouteActive(pathname, item.href)
                            return (
                                <DropdownMenuItem key={item.name} asChild>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2 cursor-pointer w-full",
                                            isActive && "text-international-orange"
                                        )}
                                    >
                                        <item.icon className="h-4 w-4" />
                                        {item.name}
                                    </Link>
                                </DropdownMenuItem>
                            )
                        })}

                        <DropdownMenuSeparator />

                        {/* Sign Out */}
                        <DropdownMenuItem asChild>
                            <form action={signOut} className="w-full">
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 cursor-pointer w-full text-destructive"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Sign Out
                                </button>
                            </form>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        {/* Quick Capture Dialog - Global idea capture for mobile */}
        <QuickCaptureDialog
            open={isQuickCaptureOpen}
            onOpenChange={setIsQuickCaptureOpen}
            onCreateObjective={handleCaptureObjective}
            onCreateTask={handleCaptureTask}
        />
        </>
    )
}
