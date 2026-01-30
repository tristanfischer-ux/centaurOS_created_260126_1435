"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, CheckSquare, Clock, Store, Settings, Target, HelpCircle, MoreHorizontal, Compass, Network, MessageCircleQuestion, Sun, GraduationCap, Repeat, Bookmark } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Determines if a navigation item should be marked as active
 * Uses exact matching for root routes and prefix matching for nested routes
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) return true
    return false
}

// Primary nav items shown in bottom bar
// On ultra-narrow screens (Galaxy Fold outer), we show 4 items + More
// On regular mobile, we show 5 items + More
const mainNavigation = [
    { name: "Today", shortName: "Today", href: "/today", icon: Sun },
    { name: "Objectives", shortName: "Goals", href: "/objectives", icon: Target },
    { name: "Tasks", shortName: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Team", shortName: "Team", href: "/team", icon: Users },
    { name: "Timeline", shortName: "Time", href: "/timeline", icon: Clock, hideOnFoldOuter: true },
]

// Items in the "More" dropdown
const moreNavigation = [
    { name: "Timeline", href: "/timeline", icon: Clock, showOnFoldOuter: true },
    { name: "Retainers", href: "/retainers", icon: Repeat },
    { name: "Saved Resources", href: "/saved-resources", icon: Bookmark },
    { name: "Org Blueprint", href: "/org-blueprint", icon: Network },
    { name: "Advisory", href: "/advisory", icon: MessageCircleQuestion },
    { name: "Marketplace", href: "/marketplace", icon: Store },
    { name: "Guild", href: "/guild", icon: Compass },
    { name: "Apprenticeship", href: "/apprenticeship", icon: GraduationCap },
    { name: "Help", href: "/help", icon: HelpCircle },
    { name: "Settings", href: "/settings", icon: Settings },
]

export function MobileNav() {
    const pathname = usePathname()

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] md:hidden pb-safe px-safe">
            <div className="flex justify-around items-center h-16">
                {mainNavigation.map((item) => {
                    const isActive = isRouteActive(pathname, item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full space-y-0.5 xs:space-y-1 touch-action-manipulation",
                                isActive ? "text-international-orange" : "text-muted-foreground hover:text-foreground",
                                // Hide Timeline on Galaxy Fold outer screen to give more space
                                item.hideOnFoldOuter && "hidden xs:flex"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5 shrink-0", isActive && "fill-current")} />
                            {/* Use shorter names on ultra-narrow screens */}
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
                                moreNavigation.some(item => isRouteActive(pathname, item.href))
                                    ? "text-international-orange" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MoreHorizontal className={cn("h-5 w-5 shrink-0", moreNavigation.some(item => isRouteActive(pathname, item.href)) && "fill-current")} />
                            <span className="text-[10px] xs:text-xs font-medium">More</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2 mr-safe">
                        {moreNavigation.map((item) => {
                            const isActive = isRouteActive(pathname, item.href)
                            return (
                                <DropdownMenuItem 
                                    key={item.name} 
                                    asChild
                                    className={cn(
                                        // Only show Timeline in More menu on Galaxy Fold outer
                                        item.showOnFoldOuter && "xs:hidden"
                                    )}
                                >
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2 cursor-pointer",
                                            isActive && "text-international-orange"
                                        )}
                                    >
                                        <item.icon className="h-4 w-4" />
                                        {item.name}
                                    </Link>
                                </DropdownMenuItem>
                            )
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
