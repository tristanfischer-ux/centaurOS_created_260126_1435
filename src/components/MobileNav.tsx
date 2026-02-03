"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Users, CheckSquare, Store, Settings, Target, MoreHorizontal, Lightbulb, Inbox } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NewBadge } from "@/components/ui/new-badge"

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
    { name: "Inbox", shortName: "Inbox", href: "/home", icon: Inbox },
    { name: "Tasks", shortName: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Team", shortName: "Team", href: "/team", icon: Users },
]

// Items in the "More" dropdown (Objectives + Discovery + Settings)
const moreNavigation = [
    { name: "Objectives", href: "/objectives", icon: Target },
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb },
    { name: "Marketplace", href: "/marketplace", icon: Store },
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
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
