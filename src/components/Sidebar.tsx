/**
 * @file Sidebar.tsx — Main navigation component with four-section layout.
 *
 * @description Organizes navigation into four sections:
 * - "Me": personal pages (Today, My Profile, Updates)
 * - "Plan": strategy and execution (Strategy, Objectives, Tasks)
 * - "Workshop": collaboration and building (The Forge, Team, Specialists)
 * - "Marketplace": recruits and supplies (Guild, Apprenticeship, Inspiration, Marketplace, Orders)
 *
 * Each section header is a clickable link to a visual intro page.
 * A "New" dot appears on section headers when unseen features exist.
 * Settings and account controls live in the footer.
 *
 * @related
 * - Section registry: src/lib/features/section-registry.ts
 * - Section header: src/components/sidebar/SectionHeader.tsx
 * - New badge hook: src/hooks/useSectionNewBadge.ts
 * - Mobile nav: src/components/MobileNav.tsx
 */

"use client"

import React, { memo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    Users,
    CheckSquare,
    Store,
    Target,
    Lightbulb,
    ShoppingBag,
    UsersRound,
    FileOutput,
    Bell,
    Sparkles,
    Waypoints,
    Flame,
    MessageSquarePlus,
    Plus,
    GraduationCap,
    BookOpen,
    UserCircle,
    UserSearch,
    Settings,
    LogOut,
    CalendarDays,
} from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { UnreadIndicator } from "@/components/today/UnreadIndicator"
import { FoundrySwitcher } from "@/components/FoundrySwitcher"
import { FocusModeToggle } from "@/components/FocusModeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FeedbackDialog } from "@/components/feedback/feedback-dialog"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"
import { SectionHeader } from "@/components/sidebar/SectionHeader"
import { useSectionNewBadges } from "@/hooks/useSectionNewBadge"
import { MARKETPLACE_SUPPLIES_START_INDEX } from "@/lib/features/section-registry"
import { signOut } from "@/actions/auth"
import type { SmartGoalSuggestion } from "@/actions/smart-goals"

/**
 * Determines if a navigation item should be marked as active.
 * Uses exact matching for root routes and prefix matching for nested routes.
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) return true
    return false
}

// Keep in sync with package.json version
const APP_VERSION = "0.9.0"

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: "Me" — Personal pages
// ─────────────────────────────────────────────────────────────────────────────
const todayNavItem = { name: "Today", href: "/today", icon: CalendarDays, tooltip: "Your personalized daily focus — tasks, risks, and wins" }

const meNavigation = [
    { name: "My Profile", href: "/my-profile", icon: UserCircle, tooltip: "Your profile, companies, and marketplace presence" },
    { name: "Updates", href: "/updates", icon: Bell, tooltip: "Notes, comments, and changes across tasks and objectives" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: "Plan" — Strategy and execution
// ─────────────────────────────────────────────────────────────────────────────
const planNavigation = [
    { name: "Strategy", href: "/strategy", icon: Waypoints, tooltip: "Your strategic direction — pillars, progress, and health at a glance" },
    { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Milestones that move the strategy forward" },
    { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Day-to-day work that delivers on objectives" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: "Workshop" — Where the work happens
// ─────────────────────────────────────────────────────────────────────────────
const workshopNavigation = [
    { name: "The Forge", href: "/the-forge/cad-lab", icon: Flame, tooltip: "Turn any product idea into manufacturing-ready parametric CAD in minutes" },
    { name: "Team", href: "/team", icon: Users, tooltip: "Team members, roles, and capacity" },
    { name: "Specialists", href: "/agents", icon: UsersRound, tooltip: "Your on-demand team of experts — brief them on anything" },
    { name: "Deliverables", href: "/agents/artifacts", icon: FileOutput, tooltip: "Documents, reports, and deliverables from your specialists" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: "Marketplace" — Recruits and supplies
// ─────────────────────────────────────────────────────────────────────────────
const marketplacePeopleNavigation = [
    { name: "Recruits", href: "/recruits", icon: UserSearch, tooltip: "Find expert talent — fractional executives, specialists, and consultants" },
    { name: "Guild", href: "/guild", icon: GraduationCap, tooltip: "Community hub — events, networking, apprentice pool" },
    { name: "Apprenticeship", href: "/apprenticeship", icon: BookOpen, tooltip: "Track apprenticeship progress, OTJT hours, and learning modules" },
]

const marketplaceSuppliesNavigation = [
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb, tooltip: "Get ideas on what to do next and discover opportunities" },
    { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Find experts, suppliers, products, and services" },
    { name: "Orders", href: "/marketplace-orders", icon: ShoppingBag, tooltip: "View and manage your marketplace orders" },
]

interface FoundryInfo {
    foundryId: string
    foundryName: string
    role: string
    isPrimary: boolean
    isActive: boolean
    memberCount: number
    /** URL to the foundry's logo image, if uploaded */
    logoUrl?: string | null
}

interface SidebarProps {
    foundryName?: string
    foundryId?: string
    /** URL to the active foundry's logo image */
    foundryLogoUrl?: string | null
    userName?: string
    userRole?: string
    isCompanyAdmin?: boolean
    userFoundries?: FoundryInfo[]
}

function SidebarComponent({ foundryName, foundryId, foundryLogoUrl, userName, userRole, isCompanyAdmin, userFoundries }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { setZoom } = useZoomContext()
    const { badges } = useSectionNewBadges()
    const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false)
    const [feedbackFeatureName, setFeedbackFeatureName] = React.useState<string | undefined>(undefined)
    const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false)

    const openFeedback = (featureName?: string) => {
        setFeedbackFeatureName(featureName)
        setIsFeedbackOpen(true)
    }

    const handleCaptureObjective = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-objectives?prefill=${encodeURIComponent(prefillText)}`)
    }

    const handleCaptureTask = (rawIdea: string, suggestion?: SmartGoalSuggestion) => {
        const prefillText = suggestion?.title || rawIdea
        router.push(`/new-tasks?prefill=${encodeURIComponent(prefillText)}`)
    }

    /**
     * Renders a single navigation item with optional tooltip.
     */
    const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string; indent?: boolean }) => {
        const isActive = isRouteActive(pathname, item.href)

        const navLink = (
            <Link
                href={item.href}
                className={cn(
                    isActive
                        ? "bg-orange-50 text-international-orange font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    "group flex items-center justify-between py-2 text-sm transition-all duration-200 rounded-md",
                    item.indent ? "pl-8 pr-3" : "px-3"
                )}
            >
                <span className="flex items-center">
                    <item.icon
                        className={cn(
                            isActive ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                            "mr-3 flex-shrink-0 transition-colors",
                            item.indent ? "h-3.5 w-3.5" : "h-4 w-4"
                        )}
                        aria-hidden="true"
                    />
                    {item.name}
                </span>
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
        <div className="hidden sm:flex h-screen w-64 flex-col bg-background border-r border-slate-100 text-foreground">
            {/* App Header — ForgeOS Branding */}
            <div className="px-5 pt-8 pb-4">
                <div className="flex items-center justify-between">
                    <Link href="/today" className="group flex items-center gap-2">
                        <span className="font-display text-2xl font-bold tracking-[0.05em] text-foreground group-hover:text-international-orange transition-colors">
                            ForgeOS
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse shadow-[0_0_8px_rgba(255,69,0,0.6)]"></span>
                    </Link>
                    <div className="flex items-center gap-0.5">
                        <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setIsQuickCaptureOpen(true)}
                                    className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-international-orange hover:bg-orange-50 transition-colors"
                                    aria-label="Capture an idea"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>Capture an idea</p>
                            </TooltipContent>
                        </Tooltip>
                        <FocusModeToggle compact />
                        <NotificationCenter />
                    </div>
                </div>
            </div>

            {/* Scrollable navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
                {/* Company identity — foundry name + logo */}
                <FoundrySwitcher
                    foundries={userFoundries || []}
                    currentFoundryId={foundryId}
                    currentFoundryName={foundryName}
                    currentFoundryLogoUrl={foundryLogoUrl}
                    userName={userName}
                    userRole={userRole}
                />

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 1: "Me" — Personal pages                  */}
                {/* ══════════════════════════════════════════════════ */}
                <SectionHeader label="Me" introRoute="/me" hasNew={badges.me} />
                {renderNavItem(todayNavItem)}
                {meNavigation.map(renderNavItem)}

                {/* Unread messages indicator */}
                <div className="px-0 pb-1">
                    <UnreadIndicator />
                </div>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 2: "Plan" — Strategy and execution         */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="my-2 border-t border-slate-100" />

                <SectionHeader label="Plan" introRoute="/plan" hasNew={badges.plan} />
                {planNavigation.map(renderNavItem)}

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 3: "Workshop" — Where the work happens     */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="my-2 border-t border-slate-100" />

                <SectionHeader label="Workshop" introRoute="/workshop" hasNew={badges.workshop} />
                {workshopNavigation.map(renderNavItem)}

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 4: "Marketplace" — Recruits and supplies   */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="my-2 border-t border-slate-100" />

                <SectionHeader label="Marketplace" introRoute="/marketplace-hub" hasNew={badges.marketplace} />

                {/* People sub-label */}
                <div className="px-3 pt-1 pb-0.5">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
                        People
                    </p>
                </div>
                {marketplacePeopleNavigation.map(renderNavItem)}

                {/* Supplies sub-label */}
                <div className="px-3 pt-2 pb-0.5">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
                        Supplies
                    </p>
                </div>
                {marketplaceSuppliesNavigation.map(renderNavItem)}
            </nav>

            {/* Footer — Settings, What's New, Sign Out, Zoom, Feedback, Version */}
            <div className="p-4 mt-auto space-y-3 border-t border-slate-100">
                {/* Settings */}
                <Link
                    href="/settings"
                    className={cn(
                        isRouteActive(pathname, "/settings")
                            ? "text-international-orange font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        "flex items-center gap-2 px-2 py-1.5 text-xs transition-colors rounded-md"
                    )}
                >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                </Link>

                {/* What's New link */}
                <Link
                    href="/whats-new"
                    className={cn(
                        isRouteActive(pathname, "/whats-new")
                            ? "text-international-orange font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        "flex items-center gap-2 px-2 py-1.5 text-xs transition-colors rounded-md"
                    )}
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    What&apos;s New
                </Link>

                {/* Sign Out */}
                <form action={signOut}>
                    <button
                        type="submit"
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        Sign Out
                    </button>
                </form>

                {/* Zoom Control */}
                <div className="flex justify-center">
                    <ZoomControl onZoomChange={setZoom} />
                </div>

                {/* Early Access badge + Feedback + Version */}
                <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-international-orange/10 text-international-orange text-[10px] font-semibold tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse" />
                            Early Access
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono opacity-60">
                            v{APP_VERSION}
                        </span>
                    </div>

                    <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                        <button
                            onClick={() => openFeedback()}
                            className="inline-flex items-center gap-1 hover:text-international-orange transition-colors cursor-pointer"
                            aria-label="Share feedback"
                        >
                            <MessageSquarePlus className="h-3 w-3" />
                            <span>Feedback</span>
                        </button>
                        <span className="opacity-30">·</span>
                        <span className="opacity-50">
                            <kbd className="px-1 py-0.5 bg-muted text-[9px]">⌘K</kbd> search
                        </span>
                    </div>
                </div>
            </div>

            {/* Feedback Dialog */}
            <FeedbackDialog
                open={isFeedbackOpen}
                onOpenChange={setIsFeedbackOpen}
                featureName={feedbackFeatureName}
            />

            {/* Quick Capture Dialog — Global idea capture */}
            <QuickCaptureDialog
                open={isQuickCaptureOpen}
                onOpenChange={setIsQuickCaptureOpen}
                onCreateObjective={handleCaptureObjective}
                onCreateTask={handleCaptureTask}
            />
        </div>
    )
}

export const Sidebar = memo(SidebarComponent)
