"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, CheckSquare, Clock, Store, Settings, Target, HelpCircle, MoreHorizontal, Compass } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const mainNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Objectives", href: "/objectives", icon: Target },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Team", href: "/team", icon: Users },
    { name: "Timeline", href: "/timeline", icon: Clock },
]

const moreNavigation = [
    { name: "Marketplace", href: "/marketplace", icon: Store },
    { name: "Guild", href: "/guild", icon: Compass },
    { name: "Help", href: "/help", icon: HelpCircle },
    { name: "Settings", href: "/settings", icon: Settings },
]

export function MobileNav() {
    const pathname = usePathname()

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] md:hidden pb-safe">
            <div className="flex justify-around items-center h-16">
                {mainNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] h-full space-y-1 touch-action-manipulation",
                                isActive ? "text-international-orange" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                            <span className="text-xs font-medium">{item.name}</span>
                        </Link>
                    )
                })}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] h-full space-y-1 touch-action-manipulation",
                                pathname.startsWith("/marketplace") || pathname.startsWith("/guild") || pathname.startsWith("/help") || pathname.startsWith("/settings")
                                    ? "text-international-orange" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MoreHorizontal className={cn("h-5 w-5", (pathname.startsWith("/marketplace") || pathname.startsWith("/guild") || pathname.startsWith("/help") || pathname.startsWith("/settings")) && "fill-current")} />
                            <span className="text-xs font-medium">More</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2">
                        {moreNavigation.map((item) => {
                            const isActive = pathname.startsWith(item.href)
                            return (
                                <DropdownMenuItem key={item.name} asChild>
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
