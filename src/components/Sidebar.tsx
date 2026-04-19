/**
 * @file Sidebar.tsx — Main navigation component with four-section layout.
 *
 * @description Organizes navigation into five sections:
 * - "Me": personal pages (Today, My Profile, Updates)
 * - "Plan": strategy and execution (Strategy, Objectives, Tasks, Reports)
 * - "Finance": financial overview (Overview, Money Map, Invoices)
 * - "Workshop": collaboration and building (The Forge, Team, Specialists, Outputs, Browse, Inspiration)
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
    Plus,
    Settings,
    LogOut,
    PoundSterling,
} from "lucide-react"
// Section-owned navigation data. One file per section so Phase 2/3/4
// terminals can swap their section data in isolation.
import { welcomeNavItem, todayNavItem, meNavigation } from "@/components/sidebar/data/me"
import { supplierNavigation } from "@/components/sidebar/data/supplier-portal"
import { planNavigation } from "@/components/sidebar/data/plan"
import { moneyLegacyNavigation } from "@/components/sidebar/data/money"
import { getWorkshopNavigation } from "@/components/sidebar/data/workshop"
import { marketplacePeopleNavigation, marketplaceSuppliesNavigation } from "@/components/sidebar/data/marketplace"
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
import { AICreditsBarLoader } from "@/components/ui/ai-credits-bar"
import { TimeWeekBarLoader } from "@/components/ui/time-week-bar"
import { useSectionNewBadges } from "@/hooks/useSectionNewBadge"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import { isRouteAlpha, isRouteBeta, isRouteDemo, isRouteComingSoon } from "@/lib/features/registry"
import { signOut } from "@/actions/auth"
import { updateOnboardingData, type OnboardingData } from "@/actions/onboarding"
import { getMyReferralInfo } from "@/actions/referrals"
import { toast } from "sonner"
import type { SmartGoalSuggestion } from "@/actions/smart-goals"
import { getUnreadAlertCount } from "@/actions/match-alerts"
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist"
import { VideoWalkthrough } from "@/components/ui/video-walkthrough"

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

// Section navigation data lives in ./sidebar/data/* — see the imports above.
// Phase 3 (Plan) and Phase 4 (Money) will swap their respective data files
// in isolation; the sidebar component here stays unchanged across those
// phases. PR #1 only makes Workshop's Forge entry flag-aware — everything
// else is legacy content in new homes.

interface FoundryInfo {
    foundryId: string
    foundryName: string
    role: string
    isPrimary: boolean
    isActive: boolean
    memberCount: number
    /** URL to the foundry's logo image, if uploaded */
    logoUrl?: string | null
    /** Whether this is a personal sandbox workspace */
    isSandbox?: boolean
}

interface SidebarProps {
    foundryName?: string
    foundryId?: string
    /** URL to the active foundry's logo image */
    foundryLogoUrl?: string | null
    /** Whether the active foundry is a personal sandbox */
    foundryIsSandbox?: boolean
    userName?: string
    userRole?: string
    isCompanyAdmin?: boolean
    userFoundries?: FoundryInfo[]
    /** Onboarding data from profiles.onboarding_data for the Getting Started checklist */
    onboardingData?: Record<string, unknown>
    /** Reveals the "Supplier Portal" sidebar section. Set from profiles.is_supplier. */
    isSupplier?: boolean
    /**
     * Phase 1 flag — when true, Workshop's "The Forge" nav item routes to
     * /the-forge-v2 instead of /the-forge. Read server-side in
     * (platform)/layout.tsx via getCurrentUserFeatureFlag(FLAG_NEW_FORGE_EXPERIENCE).
     * Default false so flag-off users keep the current experience.
     */
    newForgeExperienceEnabled?: boolean
}

export function Sidebar({ foundryName, foundryId, foundryLogoUrl, foundryIsSandbox, userName, userRole, userFoundries, onboardingData, isSupplier, newForgeExperienceEnabled = false }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { setZoom } = useZoomContext()
    const { badges } = useSectionNewBadges()
    const { openSections, toggleSection } = useSidebarCollapse(pathname)
    const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false)
    const [feedbackFeatureName, setFeedbackFeatureName] = React.useState<string | undefined>(undefined)
    const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false)

    // Unread alert count for sidebar badge
    const [unreadAlertCount, setUnreadAlertCount] = React.useState(0)

    // INTENT: Prefetch the most-visited routes immediately after the sidebar
    // mounts so the first click to any of these pages is near-instant. Combined
    // with staleTimes (30s dynamic cache), this means the RSC payload is already
    // in the client cache before the user clicks.
    React.useEffect(() => {
        const topRoutes = ['/today', '/new-tasks', '/new-objectives', '/team', '/the-forge', '/strategy', '/my-profile', '/updates', '/reports', '/cash-burn']
        topRoutes.forEach(route => router.prefetch(route))
    }, [router])

    // Fetch unread alert count on mount and on route change (debounced)
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            getUnreadAlertCount().then(setUnreadAlertCount).catch(() => {})
        }, 500)
        return () => clearTimeout(timeout)
    }, [pathname])

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

    const handleShareReferral = React.useCallback(async () => {
        try {
            const info = await getMyReferralInfo()
            if ('error' in info) {
                toast.error('Could not load your referral link.')
                return
            }
            const url = `${window.location.origin}/join?ref=${info.referralCode}`
            await navigator.clipboard.writeText(url)
            toast.success('Referral link copied to clipboard!')
            await updateOnboardingData({ checklist_friend_invited: true })
        } catch {
            toast.error('Failed to copy referral link.')
        }
    }, [])

    /**
     * Renders a single navigation item with optional tooltip.
     */
    const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string; indent?: boolean; badge?: number }) => {
        const isActive = isRouteActive(pathname, item.href)
        const isAlpha = isRouteAlpha(item.href)
        const isBeta = isRouteBeta(item.href)
        const isDemo = isRouteDemo(item.href)
        const isComingSoon = isRouteComingSoon(item.href)

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
                    {item.badge != null && item.badge > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-international-orange text-white text-[10px] font-bold leading-none">
                            {item.badge > 99 ? '99+' : item.badge}
                        </span>
                    )}
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
                {isDemo && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-international-orange/10 text-international-orange border border-international-orange/20">
                        Demo
                    </span>
                )}
                {isComingSoon && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                        Soon
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
        <div className="hidden sm:flex h-screen w-64 shrink-0 flex-col bg-background border-r border-border text-foreground">
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
                    currentFoundryIsSandbox={foundryIsSandbox}
                    userName={userName}
                    userRole={userRole}
                />

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 1: "Me" — Personal pages                  */}
                {/* ══════════════════════════════════════════════════ */}
                <SectionHeader label="Me" introRoute="/me" hasNew={badges.me} isOpen={openSections.me} onToggle={() => toggleSection("me")} />
                <Collapsible open={openSections.me}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {renderNavItem(welcomeNavItem)}
                        {renderNavItem(todayNavItem)}
                        {meNavigation.map(item =>
                            renderNavItem(item.href === '/updates' ? { ...item, badge: unreadAlertCount } : item)
                        )}

                        {/* Unread messages indicator */}
                        <div className="px-0 pb-1">
                            <UnreadIndicator />
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 1b: "Supplier Portal" (gated on is_supplier)*/}
                {/* ══════════════════════════════════════════════════ */}
                {isSupplier && (
                    <>
                        <div className="mt-1.5 mb-0.5 border-t border-border" />
                        <SectionHeader label="Supplier Portal" introRoute="/supplier" hasNew={false} isOpen={openSections.supplier} onToggle={() => toggleSection("supplier")} />
                        <Collapsible open={openSections.supplier}>
                            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                                {supplierNavigation.map(renderNavItem)}
                            </CollapsibleContent>
                        </Collapsible>
                    </>
                )}

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 2: "Plan" — Strategy and execution         */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-border" />

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
                <div className="mt-1.5 mb-0.5 border-t border-border" />

                <SectionHeader label="Cash Burn" introRoute="/cash-burn" isOpen={openSections.cashBurn} onToggle={() => toggleSection("cashBurn")} />
                <Collapsible open={openSections.cashBurn}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {moneyLegacyNavigation.map(renderNavItem)}
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 4: "Workshop" — Where the work happens     */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-border" />

                <SectionHeader label="Workshop" introRoute="/workshop" hasNew={badges.workshop} isOpen={openSections.workshop} onToggle={() => toggleSection("workshop")} />
                <Collapsible open={openSections.workshop}>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {getWorkshopNavigation(newForgeExperienceEnabled).map(renderNavItem)}
                    </CollapsibleContent>
                </Collapsible>

                {/* ══════════════════════════════════════════════════ */}
                {/* Section 5: "Marketplace" — Recruits and supplies   */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="mt-1.5 mb-0.5 border-t border-border" />

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

            {/* Getting Started Checklist — shown for new users */}
            {onboardingData && (
                <GettingStartedChecklist
                    userRole={userRole}
                    onboardingData={onboardingData as OnboardingData}
                    onItemComplete={(key) => {
                        updateOnboardingData({ [key]: true }).catch(() => {})
                    }}
                    onDismiss={() => {
                        updateOnboardingData({ checklist_dismissed: true }).catch(() => {})
                    }}
                    onShareReferral={handleShareReferral}
                />
            )}

            {/* Footer — Compact: Settings + Sign Out row, then status bars */}
            <div className="p-3 mt-auto space-y-2 border-t border-border">
                {/* Pricing + Settings + Sign Out on one row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link
                            href="/pricing"
                            className={cn(
                                isRouteActive(pathname, "/pricing")
                                    ? "text-international-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground",
                                "flex items-center gap-1.5 px-2 py-1 text-xs transition-colors rounded-md"
                            )}
                        >
                            <PoundSterling className="h-3.5 w-3.5" />
                            Pricing
                        </Link>
                        <Link
                            href="/settings"
                            className={cn(
                                isRouteActive(pathname, "/settings")
                                    ? "text-international-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground",
                                "flex items-center gap-1.5 px-2 py-1 text-xs transition-colors rounded-md"
                            )}
                        >
                            <Settings className="h-3.5 w-3.5" />
                            Settings
                        </Link>
                    </div>
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md"
                        >
                            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                            Sign Out
                        </button>
                    </form>
                </div>

                {/* Status bars — daily accountability */}
                <div className="space-y-1">
                    <TimeWeekBarLoader />
                    <AICreditsBarLoader />
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
