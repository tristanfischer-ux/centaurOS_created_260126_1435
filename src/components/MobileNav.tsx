/**
 * @file MobileNav.tsx — Bottom navigation bar for mobile devices.
 *
 * @description Shows My Profile, Updates, Tasks in the main bar.
 * "More" dropdown groups remaining items into four sections matching
 * the sidebar: Plan, Workshop, Marketplace, and Account.
 *
 * @related
 * - Sidebar: src/components/Sidebar.tsx
 * - Section registry: src/lib/features/section-registry.ts
 */

"use client"

import React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    Users,
    CheckSquare,
    Store,
    Settings,
    Target,
    MoreHorizontal,
    UsersRound,
    UserSearch,
    LogOut,
    Waypoints,
    Plus,
    GraduationCap,
    BookOpen,
    ShoppingBag,
    Flame,
    CalendarDays,
    AppWindow,
    FileOutput,
    Globe,
    Brain,
    Handshake,
    MessageCircle,
    Send,
    PoundSterling,
    FileText,
    Map,
    BellRing,
    Activity,
    BarChart3,
    PiggyBank,
    FolderKanban,
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { isRouteAlpha } from "@/lib/features/registry"
import { signOut } from "@/actions/auth"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"

import type { SmartGoalSuggestion } from "@/actions/smart-goals"

/**
 * Determines if a navigation item should be marked as active.
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) return true
    return false
}

// Primary nav items shown in the bottom bar
const mainNavigation = [
    { name: "Today", shortName: "Today", href: "/today", icon: CalendarDays },
    { name: "Comms", shortName: "Comms", href: "/updates", icon: MessageCircle },
    { name: "Tasks", shortName: "Tasks", href: "/new-tasks", icon: CheckSquare },
]

// "More" dropdown — Me section (items not in main bar)
const meMoreNavigation = [
    { name: "Knowledge", href: "/knowledge", icon: Brain },
    { name: "Google Apps", href: "/google-apps", icon: AppWindow },
]

// "More" dropdown — Plan section
const planMoreNavigation = [
    { name: "Strategy", href: "/canvas", icon: Waypoints },
    { name: "Objectives", href: "/new-objectives", icon: Target },
    { name: "Outreach", href: "/outreach", icon: Send },
]

// "More" dropdown — Finance section
const financeMoreNavigation = [
    { name: "Finance", href: "/finance", icon: PoundSterling },
    { name: "Money Map", href: "/finance/money-map", icon: Map },
    { name: "Invoices", href: "/finance/invoices", icon: FileText },
    { name: "Cash Flow", href: "/finance/cash-flow", icon: Activity },
    { name: "Reports", href: "/finance/reports", icon: BarChart3 },
    { name: "Budgets", href: "/finance/budgets", icon: PiggyBank },
    { name: "Projects", href: "/finance/projects", icon: FolderKanban },
    { name: "Alerts", href: "/finance/settings", icon: BellRing },
]

// "More" dropdown — Workshop section
const workshopMoreNavigation = [
    { name: "The Forge", href: "/the-forge", icon: Flame },
    { name: "Team", href: "/team", icon: Users },
    { name: "Retainers", href: "/retainers", icon: Handshake },
    { name: "AI Team", href: "/agents", icon: UsersRound },
    { name: "AI Outputs", href: "/agents/artifacts", icon: FileOutput },
    { name: "Browse", href: "/browse", icon: Globe },
    { name: "Inspiration", href: "/learn", icon: BookOpen },
]

// "More" dropdown — Marketplace section
const marketplaceMoreNavigation = [
    { name: "Recruits", href: "/recruits", icon: UserSearch },
    { name: "Guild", href: "/guild", icon: GraduationCap },
    { name: "Apprenticeship", href: "/apprenticeship", icon: BookOpen },
    { name: "Marketplace", href: "/marketplace", icon: Store },
    { name: "Orders", href: "/marketplace-orders", icon: ShoppingBag },
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

    const allMoreItems = [...meMoreNavigation, ...planMoreNavigation, ...financeMoreNavigation, ...workshopMoreNavigation, ...marketplaceMoreNavigation]

    /**
     * Renders a dropdown menu item with active state highlighting.
     */
    const renderDropdownItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }) => {
        const isActive = isRouteActive(pathname, item.href)
        const isAlpha = isRouteAlpha(item.href)
        return (
            <DropdownMenuItem
                key={item.name}
                onSelect={(event) => {
                    event.preventDefault()
                    router.push(item.href)
                }}
                className={cn(
                    "flex items-center justify-between gap-2 cursor-pointer w-full",
                    isActive && "text-international-orange"
                )}
            >
                <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.name}
                </span>
                {isAlpha && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                        Alpha
                    </span>
                )}
            </DropdownMenuItem>
        )
    }

    return (
        <>
        <div data-testid="mobile-nav" className="fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] sm:hidden pb-safe px-safe">
            {/* Floating "+" FAB centered above the nav bar */}
            <button
                onClick={() => setIsQuickCaptureOpen(true)}
                data-testid="mobile-fab"
                className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center justify-center h-12 w-12 rounded-full bg-international-orange text-background shadow-lg hover:bg-international-orange-hover transition-colors active:scale-95"
                aria-label="Capture an idea"
            >
                <Plus className="h-5 w-5" />
            </button>
            <div data-testid="mobile-nav-items" className="flex justify-around items-center h-16">
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
                            <span className="text-xs font-medium truncate max-w-[48px] xs:max-w-none">
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
                                allMoreItems.some(item => isRouteActive(pathname, item.href))
                                    ? "text-international-orange" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MoreHorizontal className={cn("h-5 w-5 shrink-0", allMoreItems.some(item => isRouteActive(pathname, item.href)) && "fill-current")} />
                            <span className="text-xs font-medium">More</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2 mr-safe w-56">
                        {/* Me section */}
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Me
                        </DropdownMenuLabel>
                        {meMoreNavigation.map(renderDropdownItem)}

                        <DropdownMenuSeparator />

                        {/* Plan section */}
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Plan
                        </DropdownMenuLabel>
                        {planMoreNavigation.map(renderDropdownItem)}

                        <DropdownMenuSeparator />

                        {/* Finance section */}
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Finance
                        </DropdownMenuLabel>
                        {financeMoreNavigation.map(renderDropdownItem)}

                        <DropdownMenuSeparator />

                        {/* Workshop section */}
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Workshop
                        </DropdownMenuLabel>
                        {workshopMoreNavigation.map(renderDropdownItem)}

                        <DropdownMenuSeparator />

                        {/* Marketplace section */}
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Marketplace
                        </DropdownMenuLabel>
                        {marketplaceMoreNavigation.map(renderDropdownItem)}

                        <DropdownMenuSeparator />

                        {/* Settings + Sign Out */}
                        <DropdownMenuItem
                            onSelect={(event) => {
                                event.preventDefault()
                                router.push("/settings")
                            }}
                            className={cn(
                                "flex items-center gap-2 cursor-pointer w-full",
                                isRouteActive(pathname, "/settings") && "text-international-orange"
                            )}
                        >
                            <Settings className="h-4 w-4" />
                            Settings
                        </DropdownMenuItem>

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

        {/* Quick Capture Dialog — Global idea capture for mobile */}
        <QuickCaptureDialog
            open={isQuickCaptureOpen}
            onOpenChange={setIsQuickCaptureOpen}
            onCreateObjective={handleCaptureObjective}
            onCreateTask={handleCaptureTask}
        />
        </>
    )
}
