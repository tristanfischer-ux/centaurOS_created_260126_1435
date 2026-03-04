/**
 * @file Sidebar.tsx — Main navigation component with four-section layout.
 *
 * @description Organizes navigation into five sections:
 * - "Me": personal pages (Today, My Profile, Updates)
 * - "Plan": strategy and execution (Strategy, Objectives, Tasks, Reports)
 * - "Finance": financial overview (Overview, Money Map, Invoices)
 * - "Workshop": collaboration and building (The Forge, Team, AI Team, AI Outputs, Browse, Inspiration)
 * - "Marketplace": recruits and supplies (Recruits, Guild, Apprenticeship, Marketplace, Orders)
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

import React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    Users,
    CheckSquare,
    Store,
    Target,
    ShoppingBag,
    UsersRound,
    FileOutput,
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
    AppWindow,
    Globe,
    Brain,
    MessageCircle,
    PoundSterling,
    FileText,
    Map,
    BellRing,
    Activity,
    BarChart3,
    PiggyBank,
    FolderKanban,
    Receipt,
    Landmark,
    Link2,
    Building2,
    TrendingDown,
    TrendingUp,
} from "lucide-react"
import { UnreadIndicator } from "@/components/today/UnreadIndicator"
import { FoundrySwitcher } from "@/components/FoundrySwitcher"
import { FocusModeToggle } from "@/components/FocusModeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FeedbackDialog } from "@/components/feedback/feedback-dialog"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"
import { SectionHeader } from "@/components/sidebar/SectionHeader"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { useSectionNewBadges } from "@/hooks/useSectionNewBadge"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import { isRouteAlpha, isRouteBeta } from "@/lib/features/registry"
import { signOut } from "@/actions/auth"
import { updateOnboardingData, type OnboardingData } from "@/actions/onboarding"
import type { SmartGoalSuggestion } from "@/actions/smart-goals"
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist"
import { VideoWalkthrough } from "@/components/ui/video-walkthrough"
import { VIDEOS } from "@/lib/video-urls"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
    { name: "Comms", href: "/updates", icon: MessageCircle, tooltip: "Activity feed, conversations, and direct messages" },
    { name: "Knowledge", href: "/knowledge", icon: Brain, tooltip: "Your organizational second brain — decisions, insights, and lessons" },
    { name: "Google Apps", href: "/google-apps", icon: AppWindow, tooltip: "Your Google Drive, Docs, Calendar, and Email" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: "Plan" — Strategy and execution
// ─────────────────────────────────────────────────────────────────────────────
const planNavigation = [
    { name: "Strategy", href: "/strategy", icon: Waypoints, tooltip: "Your strategic direction — pillars, progress, and health at a glance" },
    { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Milestones that move the strategy forward" },
    { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Day-to-day work that delivers on objectives" },
    { name: "Reports", href: "/reports", icon: FileOutput, tooltip: "Generate polished weekly updates and board packs from your live data" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: "Finance" — Hidden for now, may be restored later
// ─────────────────────────────────────────────────────────────────────────────
// const financeNavigation = [
//     { name: "Overview", href: "/finance", icon: PoundSterling, tooltip: "Your unified financial dashboard — revenue, expenses, cash flow, and invoices" },
//     { name: "Money Map", href: "/finance/money-map", icon: Map, tooltip: "Visualise revenue streams, costs, and profitability" },
//     { name: "Invoices", href: "/finance/invoices", icon: FileText, tooltip: "Track outstanding payments and aging buckets" },
//     { name: "Cash Flow", href: "/finance/cash-flow", icon: Activity, tooltip: "Forward-looking cash flow projections with scenario modeling" },
//     { name: "Reports", href: "/finance/reports", icon: BarChart3, tooltip: "Generate P&L, VAT, and Cash Flow Statement reports" },
//     { name: "Budgets", href: "/finance/budgets", icon: PiggyBank, tooltip: "Track budget allocations vs actual spend with variance analysis" },
//     { name: "Projects", href: "/finance/projects", icon: FolderKanban, tooltip: "Per-project profitability tracking and P&L" },
//     { name: "Expenses", href: "/finance/expenses", icon: Receipt, tooltip: "Track and manage business expenses" },
//     { name: "Funding", href: "/finance/funding", icon: Landmark, tooltip: "Track funding opportunities and grant applications" },
//     { name: "Integrations", href: "/finance/integrations", icon: Link2, tooltip: "Connect Xero, QuickBooks, or FreeAgent" },
//     { name: "Alerts", href: "/finance/settings", icon: BellRing, tooltip: "Configure financial alert thresholds and digest preferences" },
// ]

// ─────────────────────────────────────────────────────────────────────────────
// Section 3b: "Cash Burn" — Runway and scenario planning
// ─────────────────────────────────────────────────────────────────────────────
const cashBurnNavigation = [
    { name: "Cash Burn", href: "/cash-burn", icon: Flame, tooltip: "52-week runway analysis with scenario modelling" },
    { name: "Cash Out", href: "/cash-burn/cash-out", icon: TrendingDown, tooltip: "Fixed and variable cost management" },
    { name: "Cash In", href: "/cash-burn/cash-in", icon: TrendingUp, tooltip: "Revenue, loans, equity, and grants" },
    { name: "P&L", href: "/cash-burn/pnl", icon: BarChart3, tooltip: "Projected Income Statement and Balance Sheet" },
    { name: "Investors", href: "/investors", icon: Building2, tooltip: "Browse 600 UK VC and PE firms — search, filter, and track outreach" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: "Workshop" — Where the work happens
// ─────────────────────────────────────────────────────────────────────────────
const workshopNavigation = [
    { name: "The Forge", href: "/the-forge", icon: Flame, tooltip: "Turn product ideas into manufacturing-ready engineering packages" },
    { name: "Team", href: "/team", icon: Users, tooltip: "Team members, roles, and capacity" },
    { name: "AI Team", href: "/agents", icon: UsersRound, tooltip: "13 AI specialists — strategy, engineering, finance, legal, hiring, and more" },
    { name: "AI Outputs", href: "/agents/artifacts", icon: FileOutput, tooltip: "Documents, decks, and analysis generated by your AI specialists" },
    { name: "Browse", href: "/browse", icon: Globe, tooltip: "Browse the web with your specialist — get real-time guidance and analysis" },
    { name: "Inspiration", href: "/learn", icon: BookOpen, tooltip: "Techniques, tutorials, and expert guidance to level up your skills" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: "Marketplace" — Recruits and supplies
// ─────────────────────────────────────────────────────────────────────────────
const marketplacePeopleNavigation = [
    { name: "Recruits", href: "/recruits", icon: UserSearch, tooltip: "Find expert talent — fractional executives, specialists, and consultants" },
    { name: "Guild", href: "/guild", icon: GraduationCap, tooltip: "Community hub — events, networking, apprentice pool" },
    { name: "Apprenticeship", href: "/apprenticeship", icon: BookOpen, tooltip: "Track apprenticeship progress, OTJT hours, and learning modules" },
]

// DECISION: Playbooks content moved into the Objectives page as "Other ideas for
// you to be getting on with". Learn/educational content moved to Workshop as
// "Inspiration". This mirrors the Team page pattern (your stuff + marketplace).
const marketplaceSuppliesNavigation = [
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
    /** Onboarding data from profiles.onboarding_data for the Getting Started checklist */
    onboardingData?: Record<string, unknown>
}

export function Sidebar({ foundryName, foundryId, foundryLogoUrl, userName, userRole, userFoundries, onboardingData }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { setZoom } = useZoomContext()
    const { badges } = useSectionNewBadges()
    const { openSections, toggleSection } = useSidebarCollapse(pathname)
    const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false)
    const [feedbackFeatureName, setFeedbackFeatureName] = React.useState<string | undefined>(undefined)
    const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false)
    const [isVideoModalOpen, setIsVideoModalOpen] = React.useState(false)

    // INTENT: Prefetch the most-visited routes immediately after the sidebar
    // mounts so the first click to any of these pages is near-instant. Combined
    // with staleTimes (30s dynamic cache), this means the RSC payload is already
    // in the client cache before the user clicks.
    React.useEffect(() => {
        const topRoutes = ['/today', '/new-tasks', '/new-objectives', '/team', '/the-forge', '/strategy', '/my-profile', '/updates', '/knowledge', '/reports', '/cash-burn']
        topRoutes.forEach(route => router.prefetch(route))
    }, [router])

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
        const isAlpha = isRouteAlpha(item.href)
        const isBeta = isRouteBeta(item.href)

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
                {isAlpha && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                        Alpha
                    </span>
                )}
                {isBeta && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                        Beta
                    </span>
                )}
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
        <div className="hidden sm:flex h-screen w-64 shrink-0 flex-col bg-background border-r border-slate-100 text-foreground">
            {/* App Header — ForgeOS Branding */}
            <div className="px-5 pt-8 pb-2">
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
                    </div>
                </div>
            </div>

            {/* Scrollable navigation */}
            <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
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
                <SectionHeader label="Me" introRoute="/me" hasNew={badges.me} isOpen={openSections.me} onToggle={() => toggleSection("me")} />
                <Collapsible open={openSections.me}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {renderNavItem(todayNavItem)}
                        {meNavigation.map(renderNavItem)}

                        {/* Unread messages indicator */}
                        <div className="px-0 pb-1">
                            <UnreadIndicator />
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 2: "Plan" — Strategy and execution         */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-slate-100" />

                <SectionHeader label="Plan" introRoute="/plan" hasNew={badges.plan} isOpen={openSections.plan} onToggle={() => toggleSection("plan")} />
                <Collapsible open={openSections.plan}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {planNavigation.map(renderNavItem)}
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 3: "Finance" — Hidden for now               */}
                {/* ══════════════════════════════════════════════════ */}

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 3b: "Cash Burn" — Runway planning           */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-slate-100" />
                <div className="px-3 pt-2 pb-0.5">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
                        Cash Burn
                    </p>
                </div>
                {cashBurnNavigation.map(renderNavItem)}

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 4: "Workshop" — Where the work happens     */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-slate-100" />

                <SectionHeader label="Workshop" introRoute="/workshop" hasNew={badges.workshop} isOpen={openSections.workshop} onToggle={() => toggleSection("workshop")} />
                <Collapsible open={openSections.workshop}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {workshopNavigation.map(renderNavItem)}
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 5: "Marketplace" — Recruits and supplies   */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-slate-100" />

                <SectionHeader label="Marketplace" introRoute="/marketplace-hub" hasNew={badges.marketplace} isOpen={openSections.marketplace} onToggle={() => toggleSection("marketplace")} />
                <Collapsible open={openSections.marketplace}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
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
                    </CollapsibleContent>
                </Collapsible>
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

                {/* Getting Started Checklist */}
                {onboardingData && !(onboardingData as OnboardingData).checklist_dismissed && !(onboardingData as OnboardingData).checklist_completed_at && (
                    <div className="border-t border-slate-100 pt-3">
                        <GettingStartedChecklist
                            userRole={userRole}
                            onboardingData={onboardingData as OnboardingData}
                            onItemComplete={async (key: string) => {
                                await updateOnboardingData({ [key]: true })
                            }}
                            onDismiss={async () => {
                                await updateOnboardingData({ checklist_dismissed: true })
                            }}
                            onPlayVideo={VIDEOS.platformOverview.videoUrl ? () => setIsVideoModalOpen(true) : undefined}
                        />
                    </div>
                )}

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

            {/* Platform Overview Video Modal */}
            <Dialog open={isVideoModalOpen} onOpenChange={setIsVideoModalOpen}>
                <DialogContent size="lg" className="gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
                    <DialogHeader className="sr-only">
                        <DialogTitle>Platform Overview</DialogTitle>
                    </DialogHeader>
                    <div className="relative aspect-video w-full">
                        {VIDEOS.platformOverview.videoUrl ? (
                            <video
                                src={VIDEOS.platformOverview.videoUrl}
                                poster={VIDEOS.platformOverview.thumbnailUrl}
                                controls
                                playsInline
                                autoPlay
                                className="absolute inset-0 h-full w-full object-contain bg-foreground/5"
                                aria-label="Platform Overview"
                            >
                                <track kind="captions" />
                            </video>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
