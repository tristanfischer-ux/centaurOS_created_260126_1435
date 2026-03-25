/**
 * @file MobileNav.tsx — Bottom navigation bar for mobile devices.
 *
 * @description Shows Today, Comms, Tasks in the main bar.
 * "More" opens a full-screen Drawer (vaul) that groups remaining items
 * into five sections matching the sidebar: Me, Plan, Cash Burn, Workshop, Marketplace.
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
    Hammer,
    CalendarDays,
    AppWindow,
    Clock,
    FileOutput,
    Globe,
    Library,
    Handshake,
    MessageCircle,
    BarChart3,
    TrendingDown,
    TrendingUp,
    Building2,
    ScrollText,
    UserCircle,
    Sprout,
    Sparkles,
} from "lucide-react"
import {
    Drawer,
    DrawerTrigger,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerClose,
} from "@/components/ui/drawer"
import { isRouteAlpha, isRouteBeta, isRouteDemo } from "@/lib/features/registry"
import { signOut } from "@/actions/auth"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"
import { getUnreadAlertCount } from "@/actions/match-alerts"

import type { SmartGoalSuggestion } from "@/actions/smart-goals"
import type { LucideIcon } from "lucide-react"

/**
 * All drawer/bar item hrefs that have their own nav entry.
 * Used to prevent parent routes from matching child routes
 * (e.g. /agents should not highlight when on /agents/artifacts).
 */
const allNavHrefs = new Set([
    "/today", "/updates", "/new-tasks",
    "/my-profile", "/knowledge", "/google-apps", "/whats-new",
    "/strategy", "/new-objectives", "/time", "/reports",
    "/cash-burn", "/cash-burn/cash-out", "/cash-burn/cash-in", "/cash-burn/pnl", "/investors", "/fundraise",
    "/the-forge", "/team", "/retainers", "/agents", "/agents/artifacts", "/browse", "/learn",
    "/recruits", "/guild", "/apprenticeship", "/marketplace", "/marketplace-orders",
    "/settings",
])

/**
 * Determines if a navigation item should be marked as active.
 * Prevents parent routes from matching when a more specific child route
 * has its own nav entry (e.g. /agents vs /agents/artifacts).
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) {
        // Don't match parent if the actual pathname matches a more specific nav entry
        for (const navHref of allNavHrefs) {
            if (navHref !== href && navHref.startsWith(href + '/') && (pathname === navHref || pathname.startsWith(navHref + '/'))) {
                return false
            }
        }
        return true
    }
    return false
}

// Primary nav items shown in the bottom bar
const mainNavigation = [
    { name: "Today", shortName: "Today", href: "/today", icon: CalendarDays },
    { name: "Comms", shortName: "Comms", href: "/updates", icon: MessageCircle },
    { name: "Tasks", shortName: "Tasks", href: "/new-tasks", icon: CheckSquare },
]

// Drawer — Me section
const meMoreNavigation = [
    { name: "My Profile", href: "/my-profile", icon: UserCircle },
    { name: "Knowledge", href: "/knowledge", icon: Library },
    { name: "Google Apps", href: "/google-apps", icon: AppWindow },
    { name: "What's New", href: "/whats-new", icon: Sparkles },
]

// Drawer — Plan section
const planMoreNavigation = [
    { name: "Strategy", href: "/strategy", icon: Waypoints },
    { name: "Objectives", href: "/new-objectives", icon: Target },
    { name: "Time", href: "/time", icon: Clock },
    { name: "Reports", href: "/reports", icon: FileOutput },
]

// Drawer — Cash Burn section
const cashBurnNavigation = [
    { name: "Cash Burn", href: "/cash-burn", icon: Flame },
    { name: "Cash Out", href: "/cash-burn/cash-out", icon: TrendingDown },
    { name: "Cash In", href: "/cash-burn/cash-in", icon: TrendingUp },
    { name: "P&L", href: "/cash-burn/pnl", icon: BarChart3 },
    { name: "Investors", href: "/investors", icon: Building2 },
    { name: "Fundraise", href: "/fundraise", icon: Sprout },
]

// Drawer — Workshop section
const workshopMoreNavigation = [
    { name: "The Forge", href: "/the-forge", icon: Hammer },
    { name: "Team", href: "/team", icon: Users },
    { name: "Retainers", href: "/retainers", icon: Handshake },
    { name: "Specialists", href: "/agents", icon: UsersRound },
    { name: "Outputs", href: "/agents/artifacts", icon: FileOutput },
    { name: "Browse", href: "/browse", icon: Globe },
    { name: "Inspiration", href: "/learn", icon: BookOpen },
]

// Drawer — Marketplace section
const marketplaceMoreNavigation = [
    { name: "Recruits", href: "/recruits", icon: UserSearch },
    { name: "Guild", href: "/guild", icon: GraduationCap },
    { name: "Apprenticeship", href: "/apprenticeship", icon: ScrollText },
    { name: "Marketplace", href: "/marketplace", icon: Store },
    { name: "Orders", href: "/marketplace-orders", icon: ShoppingBag },
]

const allMoreItems = [...meMoreNavigation, ...planMoreNavigation, ...cashBurnNavigation, ...workshopMoreNavigation, ...marketplaceMoreNavigation]

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
    return (
        <div
            data-testid={`section-${label.toLowerCase().replace(/\s+/g, '-')}`}
            className="flex items-center gap-2 px-4 pt-4 pb-1"
        >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                {label}
            </span>
        </div>
    )
}

function Divider() {
    return <div className="border-t border-border mx-4 my-1" />
}

interface MobileNavProps {
    foundryName?: string
}

export function MobileNav({ foundryName }: MobileNavProps) {
    const pathname = usePathname()
    const router = useRouter()
    const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false)
    const [unreadCount, setUnreadCount] = React.useState(0)
    const [drawerOpen, setDrawerOpen] = React.useState(false)

    // Close drawer on route change (safety net if vaul's onOpenChange is slow)
    React.useEffect(() => {
        setDrawerOpen(false)
    }, [pathname])

    // Fetch unread alert count on mount and route change (matches Sidebar pattern)
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            getUnreadAlertCount().then(setUnreadCount).catch(() => {})
        }, 500)
        return () => clearTimeout(timeout)
    }, [pathname])

    const handleCaptureObjective = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-objectives?prefill=${encodeURIComponent(prefillText)}`)
    }

    const handleCaptureTask = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-tasks?prefill=${encodeURIComponent(prefillText)}`)
    }

    const isMoreActive = allMoreItems.some(item => isRouteActive(pathname, item.href))

    const renderDrawerItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }) => {
        const isActive = isRouteActive(pathname, item.href)
        const isAlpha = isRouteAlpha(item.href)
        const isBeta = isRouteBeta(item.href)
        const isDemo = isRouteDemo(item.href)
        return (
            <DrawerClose asChild key={item.name}>
                <Link
                    href={item.href}
                    data-testid={`drawer-item-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    className={cn(
                        "flex items-center justify-between gap-2 px-4 min-h-[44px] rounded-lg mx-2 transition-colors",
                        isActive
                            ? "bg-orange-50 text-international-orange"
                            : "text-foreground hover:bg-muted"
                    )}
                >
                    <span className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{item.name}</span>
                    </span>
                    {isAlpha && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                            Alpha
                        </span>
                    )}
                    {isBeta && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                            Beta
                        </span>
                    )}
                    {isDemo && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                            Demo
                        </span>
                    )}
                </Link>
            </DrawerClose>
        )
    }

    return (
        <>
        <div data-testid="mobile-nav" className={cn(
            "fixed bottom-0 left-0 right-0 z-50 bg-card shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.1)] sm:hidden pb-safe px-safe transition-opacity duration-200",
            drawerOpen && "opacity-0 pointer-events-none"
        )}>
            {/* Floating "+" FAB centered above the nav bar */}
            <button
                onClick={() => setIsQuickCaptureOpen(true)}
                data-testid="mobile-fab"
                className="absolute -top-6 inset-x-0 mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-international-orange text-background shadow-lg hover:bg-international-orange-hover transition-colors active:scale-95"
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
                            <span className="relative">
                                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "fill-current")} />
                                {item.href === '/updates' && unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-international-orange" />
                                )}
                            </span>
                            <span className="text-xs font-medium truncate max-w-[56px] xs:max-w-none">
                                <span className="xs:hidden">{item.shortName}</span>
                                <span className="hidden xs:inline">{item.name}</span>
                            </span>
                        </Link>
                    )
                })}
                <Drawer shouldScaleBackground={false} open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <DrawerTrigger asChild>
                        <button
                            data-testid="mobile-more-button"
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] min-w-[44px] h-full space-y-0.5 xs:space-y-1 touch-action-manipulation",
                                isMoreActive
                                    ? "text-international-orange"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <MoreHorizontal className={cn("h-5 w-5 shrink-0", isMoreActive && "fill-current")} />
                            <span className="text-xs font-medium">More</span>
                        </button>
                    </DrawerTrigger>
                    <DrawerContent className="max-h-[85dvh] rounded-t-2xl border-b-0">
                        <DrawerHeader className="pb-0">
                            {foundryName && (
                                <p className="text-sm font-semibold text-foreground truncate text-left">{foundryName}</p>
                            )}
                            <DrawerTitle className="sr-only">Navigation Menu</DrawerTitle>
                        </DrawerHeader>

                        <nav className="overflow-y-auto overflow-x-hidden pb-safe px-safe" data-testid="drawer-nav" aria-label="Main navigation">
                            {/* Me section */}
                            <SectionLabel icon={UserCircle} label="Me" />
                            {meMoreNavigation.map(renderDrawerItem)}

                            <Divider />

                            {/* Plan section */}
                            <SectionLabel icon={Waypoints} label="Plan" />
                            {planMoreNavigation.map(renderDrawerItem)}

                            <Divider />

                            {/* Cash Burn section */}
                            <SectionLabel icon={Flame} label="Cash Burn" />
                            {cashBurnNavigation.map(renderDrawerItem)}

                            <Divider />

                            {/* Workshop section */}
                            <SectionLabel icon={Hammer} label="Workshop" />
                            {workshopMoreNavigation.map(renderDrawerItem)}

                            <Divider />

                            {/* Marketplace section */}
                            <SectionLabel icon={Store} label="Marketplace" />
                            {marketplaceMoreNavigation.map(renderDrawerItem)}

                            <Divider />

                            {/* Settings */}
                            <DrawerClose asChild>
                                <Link
                                    href="/settings"
                                    data-testid="drawer-item-settings"
                                    className={cn(
                                        "flex items-center gap-3 px-4 min-h-[44px] rounded-lg mx-2 transition-colors",
                                        isRouteActive(pathname, "/settings")
                                            ? "bg-orange-50 text-international-orange"
                                            : "text-foreground hover:bg-muted"
                                    )}
                                >
                                    <Settings className="h-4 w-4" />
                                    <span className="text-sm font-medium">Settings</span>
                                </Link>
                            </DrawerClose>

                            {/* Sign Out */}
                            <form action={signOut} className="mx-2 mb-4">
                                <button
                                    type="submit"
                                    data-testid="drawer-item-sign-out"
                                    className="flex items-center gap-3 px-4 min-h-[44px] rounded-lg w-full text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                    <LogOut className="h-4 w-4" />
                                    <span className="text-sm font-medium">Sign Out</span>
                                </button>
                            </form>
                        </nav>
                    </DrawerContent>
                </Drawer>
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
