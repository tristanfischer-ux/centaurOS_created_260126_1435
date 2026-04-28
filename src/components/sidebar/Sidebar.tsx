/**
 * @file src/components/sidebar/Sidebar.tsx — Platform sidebar (PR #1.5 rebuild)
 *
 * @description Replaces the 484-line src/components/Sidebar.tsx. Structured per
 * SHARED-SIDEBAR.html's `sb-*` layout: brand → foundry → 5 sections (Me ·
 * Supplier Portal · Plan · Cash Burn · Workshop · Marketplace) → getting-started
 * card → util row (Pricing / Settings / Sign Out) → time + credits bars.
 *
 * Implementation notes:
 * - Uses the production Tailwind semantic-token system (bg-background,
 *   text-international-orange, text-muted-foreground, etc.) rather than
 *   introducing a parallel `--brand/--surface` var set. Maps the mockup's
 *   visual intent to existing tokens; no hardcoded colours.
 * - NavLink component extracted — keeps the per-item badge/alpha/beta/soon
 *   logic in one place. Adds `aria-current="page"` on the active link (a11y
 *   improvement over the previous sidebar and the mockup).
 * - Reuses existing integrations verbatim: FoundrySwitcher, SectionHeader,
 *   GettingStartedChecklist, UnreadIndicator, FeedbackDialog,
 *   QuickCaptureDialog, FocusModeToggle, AICreditsBarLoader, TimeWeekBarLoader,
 *   useSidebarCollapse, useSectionNewBadges. Section nav data lives in
 *   ./data/*.ts (extracted in PR #1).
 * - Workshop > The Forge link is flag-aware via getWorkshopNavigation(flag).
 *   Flag off → /the-forge (current). Flag on → /the-forge-v2 (lands in PR #2).
 *
 * @related
 * - Mockup: SHARED-SIDEBAR.html + forge-mockup.css lines 706–796
 * - Inventory: SIDEBAR-CLASS-INVENTORY.md (DOM map + class matrix)
 * - Layout: src/app/(platform)/layout.tsx (imports + passes props)
 * - Mobile: src/components/MobileNav.tsx (bottom nav on sm:hidden)
 * - Nav data: src/components/sidebar/data/*.ts
 */

"use client"

import React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { LogOut, PoundSterling, Settings } from "lucide-react"

import { welcomeNavItem, meNavigation } from "@/components/sidebar/data/me"
import { supplierNavigation } from "@/components/sidebar/data/supplier-portal"
import { getPlanNavigation } from "@/components/sidebar/data/plan"
import { getMoneyNavigation } from "@/components/sidebar/data/money"
import { getWorkshopNavigation } from "@/components/sidebar/data/workshop"
import { marketplacePeopleNavigation, marketplaceSuppliesNavigation } from "@/components/sidebar/data/marketplace"
import type { SidebarNavItem } from "@/components/sidebar/data/types"

import { UnreadIndicator } from "@/components/today/UnreadIndicator"
import { FoundrySwitcher } from "@/components/FoundrySwitcher"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FeedbackDialog } from "@/components/feedback/feedback-dialog"
import { AICreditsBarLoader } from "@/components/ui/ai-credits-bar"
import { TimeWeekBarLoader } from "@/components/ui/time-week-bar"
import { MoneyCreditsPill } from "@/components/sidebar/MoneyCreditsPill"
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist"

import { isRouteAlpha, isRouteBeta, isRouteComingSoon, isRouteDemo } from "@/lib/features/registry"

import { signOut } from "@/actions/auth"
import { updateOnboardingData, type OnboardingData } from "@/actions/onboarding"
import { getMyReferralInfo } from "@/actions/referrals"
import {
    ForgeAmbassadorBadge,
    ForgeAmbassadorMilestoneToast,
} from "@/components/referrals/ForgeAmbassadorBadge"
import { getUnreadAlertCount } from "@/actions/match-alerts"
import { toast } from "sonner"

// ── Types ───────────────────────────────────────────────────────────────────

interface FoundryInfo {
    foundryId: string
    foundryName: string
    role: string
    isPrimary: boolean
    isActive: boolean
    memberCount: number
    logoUrl?: string | null
    isSandbox?: boolean
}

interface SidebarProps {
    foundryName?: string
    foundryId?: string
    foundryLogoUrl?: string | null
    foundryIsSandbox?: boolean
    userName?: string
    userRole?: string
    isCompanyAdmin?: boolean
    userFoundries?: FoundryInfo[]
    onboardingData?: Record<string, unknown>
    /** Reveals the "Supplier Portal" section. From profiles.is_supplier. */
    isSupplier?: boolean
    /**
     * Phase 1 feature flag. When true, Workshop > The Forge routes to
     * /the-forge-v2 (PR #2+ surface). Default false preserves current behaviour.
     */
    newForgeExperienceEnabled?: boolean
    /**
     * Phase 2 feature flag. When true, the "Cash Burn" section header is
     * rendered as "MONEY [V2]" and the 6-item legacy nav is replaced with
     * the 3-item Cockpit · Plan · Raise group. Default false preserves the
     * current legacy experience.
     */
    newMoneyExperienceEnabled?: boolean
    /**
     * Phase 3 feature flag. When true, the PLAN section collapses from
     * 7 legacy items (Strategy · Objectives · Tasks · Review · Reports ·
     * Red Team · Knowledge) to 3 new items (Plan · Report · History).
     * Default false preserves current behaviour.
     */
    newPlanExperienceEnabled?: boolean
    /**
     * Forge Ambassador — set when the user has 10+ active paid referrals.
     * Renders the ForgeAmbassadorBadge in the sidebar footer.
     */
    isForgeAmbassador?: boolean
    /**
     * ISO timestamp of when the ambassador status was first earned.
     * Passed to ForgeAmbassadorMilestoneToast so it fires only on the
     * session when the threshold was first crossed.
     */
    ambassadorSince?: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Exact-or-prefix match. `/the-forge` considered active on `/the-forge/cad-lab/...`.
 */
function isRouteActive(pathname: string, href: string): boolean {
    if (pathname === href) return true
    if (pathname.startsWith(href + "/")) return true
    return false
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BadgePill({ children, variant }: { children: React.ReactNode; variant: "brand" | "muted" }) {
    return (
        <span
            className={cn(
                "ml-auto inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider",
                variant === "brand"
                    ? "bg-international-orange/10 text-international-orange"
                    : "bg-muted text-muted-foreground"
            )}
        >
            {children}
        </span>
    )
}

/**
 * Single nav row. Visually maps to the mockup's `.sb-link` (icon + label +
 * trailing badge/count) using production tokens.
 */
function NavLink({
    item,
    pathname,
    overrideBadge,
}: {
    item: SidebarNavItem
    pathname: string
    overrideBadge?: number
}) {
    const isActive = isRouteActive(pathname, item.href)
    const isAlpha = isRouteAlpha(item.href)
    const isBeta = isRouteBeta(item.href)
    const isDemo = isRouteDemo(item.href)
    const isComingSoon = isRouteComingSoon(item.href)
    const badge = overrideBadge ?? item.badge

    const link = (
        <Link
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
                "group flex items-center gap-2.5 py-1.5 px-2.5 rounded-md text-[13px] transition-colors",
                isActive
                    ? "bg-international-orange/10 text-international-orange font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground font-medium",
                item.indent && "pl-8"
            )}
        >
            <item.icon
                aria-hidden="true"
                className={cn(
                    "flex-shrink-0 transition-opacity",
                    item.indent ? "h-3.5 w-3.5" : "h-[15px] w-[15px]",
                    isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100"
                )}
            />
            <span className="flex-1 truncate">{item.name}</span>
            {badge != null && badge > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-international-orange text-white text-[10px] font-bold leading-none ring-2 ring-background">
                    {badge > 99 ? "99+" : badge}
                </span>
            )}
            {isAlpha && <BadgePill variant="brand">Alpha</BadgePill>}
            {isBeta && <BadgePill variant="brand">Beta</BadgePill>}
            {isDemo && <BadgePill variant="brand">Demo</BadgePill>}
            {isComingSoon && <BadgePill variant="muted">Soon</BadgePill>}
        </Link>
    )

    if (item.tooltip) {
        return (
            <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                    <p>{item.tooltip}</p>
                </TooltipContent>
            </Tooltip>
        )
    }
    return link
}

// ── Main component ──────────────────────────────────────────────────────────

export function Sidebar({
    foundryName,
    foundryId,
    foundryLogoUrl,
    foundryIsSandbox,
    userName,
    userRole,
    userFoundries,
    onboardingData,
    isSupplier,
    newForgeExperienceEnabled = false,
    newMoneyExperienceEnabled = false,
    newPlanExperienceEnabled = false,
    isForgeAmbassador = false,
    ambassadorSince = null,
}: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false)
    const [unreadAlertCount, setUnreadAlertCount] = React.useState(0)

    // INTENT: Prefetch the most-visited routes immediately so first click to
    // any of these is near-instant. Combined with staleTimes.dynamic=0, the
    // RSC payload is in the client cache before the click fires.
    React.useEffect(() => {
        const topRoutes = [
            "/today",
            "/new-tasks",
            "/new-objectives",
            "/team",
            "/the-forge",
            "/strategy",
            "/my-profile",
            "/updates",
            "/reports",
            "/cash-burn",
        ]
        topRoutes.forEach((r) => router.prefetch(r))
    }, [router])

    // Unread alert count (Updates nav badge). Debounced to avoid racing nav.
    React.useEffect(() => {
        const t = setTimeout(() => {
            getUnreadAlertCount()
                .then(setUnreadAlertCount)
                .catch(() => {
                    /* non-critical */
                })
        }, 500)
        return () => clearTimeout(t)
    }, [pathname])

    const handleShareReferral = React.useCallback(async () => {
        try {
            const info = await getMyReferralInfo()
            if ("error" in info) {
                toast.error("Could not load your referral link.")
                return
            }
            const url = `${window.location.origin}/join?ref=${info.referralCode}`
            await navigator.clipboard.writeText(url)
            toast.success("Referral link copied to clipboard!")
            await updateOnboardingData({ checklist_friend_invited: true })
        } catch {
            toast.error("Failed to copy referral link.")
        }
    }, [])

    // Workshop nav is flag-aware — Forge href flips to /the-forge-v2 when on.
    const workshopNavigation = getWorkshopNavigation(newForgeExperienceEnabled)
    // Money nav is flag-aware — legacy 6-item Cash Burn group under flag-off,
    // 3-item MONEY [V2] group (Cockpit · Plan · Raise) under flag-on.
    const moneyNavigation = getMoneyNavigation(newMoneyExperienceEnabled)
    // Plan nav is flag-aware — legacy 7-item group under flag-off,
    // 3-item Plan · Report · History group under flag-on.
    const planNavigation = getPlanNavigation(newPlanExperienceEnabled)

    return (
        <aside
            aria-label="Primary navigation"
            className="hidden sm:flex h-screen w-64 shrink-0 flex-col bg-background border-r border-border text-foreground text-[13px]"
        >
            {/* ─── Brand row ─────────────────────────────────── */}
            <div className="px-3 pt-4 pb-1 flex items-center gap-2">
                <Link
                    href="/today"
                    className="group flex items-center gap-2 font-display text-[15px] font-bold tracking-tight text-foreground hover:text-international-orange transition-colors"
                >
                    <span
                        className="h-[7px] w-[7px] rounded-full bg-international-orange shadow-[0_0_8px_rgba(255,69,0,0.6)] animate-pulse"
                        aria-hidden="true"
                    />
                    ForgeOS
                </Link>
            </div>

            {/* ─── Scrollable nav body ────────────────────────── */}
            <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {/* Foundry switcher — SHARED-SIDEBAR.html Decision E */}
                <div className="px-1 pt-1 pb-2">
                    <FoundrySwitcher
                        foundries={userFoundries || []}
                        currentFoundryId={foundryId}
                        currentFoundryName={foundryName}
                        currentFoundryLogoUrl={foundryLogoUrl}
                        currentFoundryIsSandbox={foundryIsSandbox}
                        userName={userName}
                        userRole={userRole}
                    />
                </div>

                {/*
                 * Flat nav — Tristan 2026-04-28: no macro section headings,
                 * no divider lines. One flat list: Welcome · My Profile ·
                 * Brainstorm · The Forge · Suppliers · Investors. Supplier
                 * Portal stays conditional on profile.is_supplier.
                 */}
                <NavLink item={welcomeNavItem} pathname={pathname} />
                {meNavigation.map((item) => (
                    <NavLink
                        key={item.name}
                        item={item}
                        pathname={pathname}
                        overrideBadge={item.href === "/updates" ? unreadAlertCount : undefined}
                    />
                ))}
                {planNavigation.map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                ))}
                {workshopNavigation.map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                ))}
                {[...marketplacePeopleNavigation, ...marketplaceSuppliesNavigation].map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                ))}
                {moneyNavigation.map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                ))}

                {isSupplier && supplierNavigation.map((item) => (
                    <NavLink key={item.name} item={item} pathname={pathname} />
                ))}

                <div className="px-1 pt-1">
                    <UnreadIndicator />
                </div>
            </nav>

            {/* ─── Getting Started — gated on onboarding_data presence ── */}
            {onboardingData && (
                <div className="px-2">
                    <GettingStartedChecklist
                        userRole={userRole}
                        onboardingData={onboardingData as OnboardingData}
                        onItemComplete={(key) => {
                            updateOnboardingData({ [key]: true }).catch(() => {
                                /* non-critical */
                            })
                        }}
                        onDismiss={() => {
                            updateOnboardingData({ checklist_dismissed: true }).catch(() => {
                                /* non-critical */
                            })
                        }}
                        onShareReferral={handleShareReferral}
                    />
                </div>
            )}

            {/* Forge Ambassador badge — visible when user has 10+ active paid referrals */}
            {isForgeAmbassador && (
                <div className="px-3 pt-2 pb-1">
                    <ForgeAmbassadorBadge className="text-[9px]" />
                </div>
            )}

            {/* ─── Footer stack ─── */}
            <div className="p-3 mt-auto space-y-2 border-t border-border">
                {/* Util row: Pricing · Settings · Sign Out */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link
                            href="/pricing"
                            aria-current={isRouteActive(pathname, "/pricing") ? "page" : undefined}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
                                isRouteActive(pathname, "/pricing")
                                    ? "text-international-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <PoundSterling className="h-3.5 w-3.5" aria-hidden="true" />
                            Pricing
                        </Link>
                        <Link
                            href="/settings"
                            aria-current={isRouteActive(pathname, "/settings") ? "page" : undefined}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
                                isRouteActive(pathname, "/settings")
                                    ? "text-international-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
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

                {/* Status bars: Time (this week) + Credits. Per CLAUDE.md no-AI-emphasis
                    rule, the in-product label stays "Credits", not "AI Credits".
                    The Money Credits pill (live ai_credits_ledger sum) lands here under
                    the flag — it sits below the legacy AI usage pill so the founder sees
                    both during the migration window. */}
                <div className="space-y-1">
                    <TimeWeekBarLoader />
                    <AICreditsBarLoader />
                    {newMoneyExperienceEnabled && <MoneyCreditsPill />}
                </div>
            </div>

            <FeedbackDialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />

            {/* Milestone toast — fires once per session when ambassador threshold is crossed */}
            <ForgeAmbassadorMilestoneToast since={ambassadorSince} />
        </aside>
    )
}
