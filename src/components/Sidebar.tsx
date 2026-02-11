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
    Lightbulb,
    ShoppingBag,
    Bot,
    Bell,
    Sparkles,
    Waypoints,
    ScanSearch,
    Boxes,
    MessageSquarePlus,
    Plus,
    GraduationCap,
    BookOpen,
    UserCircle,
    Settings,
    LogOut,
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
// Zone A: "Me" — Person-level navigation
// ─────────────────────────────────────────────────────────────────────────────
const personNavigation = [
    { name: "My Profile", href: "/my-profile", icon: UserCircle, tooltip: "Your profile, companies, and marketplace presence" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Zone B: "Company" — Workspace navigation (work, strategy, team)
// ─────────────────────────────────────────────────────────────────────────────
const companyNavigation = [
    // Dashboard hidden for v1 — redirects to /updates
    { name: "Updates", href: "/updates", icon: Bell, tooltip: "Notes, comments, and changes across tasks and objectives" },
    { name: "Strategy", href: "/canvas", icon: Waypoints, tooltip: "Strategy flow, timeline, and visual map of your strategic goals" },
    { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Set and track high-level strategic goals" },
    { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Manage and assign actionable items" },
    { name: "Team", href: "/team", icon: Users, tooltip: "Team members, roles, and capacity" },
    { name: "Agents", href: "/agents", icon: Bot, tooltip: "Prompt workflows — build, chain, and copy prompts" },
    { name: "Product X-Ray", href: "/product-xray", icon: ScanSearch, tooltip: "Deep product analysis across strategy, team, and marketplace" },
    { name: "X-Ray v2", href: "/product-xray-v2", icon: Sparkles, tooltip: "Redesigned product dossier — single-page engineering report" },
    { name: "X-Ray 3D", href: "/product-xray-v3", icon: Boxes, tooltip: "Product dossier with AI-generated 3D CAD models (STEP, STL, SVG)" },
    { name: "Marketplace Orders", href: "/marketplace-orders", icon: ShoppingBag, tooltip: "View and manage your marketplace orders" },
    { name: "Settings", href: "/settings", icon: Settings, tooltip: "Company configuration, integrations, and preferences" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Zone C: "Network" — Community and discovery
// ─────────────────────────────────────────────────────────────────────────────
const networkNavigation = [
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb, tooltip: "Get ideas on what to do next and discover opportunities" },
    { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Find experts, suppliers, products, and services" },
    { name: "Guild", href: "/guild", icon: GraduationCap, tooltip: "Community hub — events, networking, opportunities" },
    { name: "Apprenticeship", href: "/apprenticeship", icon: BookOpen, tooltip: "Track apprenticeship progress, OTJT hours, and learning modules" },
]

interface FoundryInfo {
    foundryId: string
    foundryName: string
    role: string
    isPrimary: boolean
    isActive: boolean
    memberCount: number
}

interface SidebarProps {
    foundryName?: string
    foundryId?: string
    userName?: string
    userRole?: string
    isCompanyAdmin?: boolean
    userFoundries?: FoundryInfo[]
}

/**
 * Sidebar — Main navigation component with three-zone layout.
 *
 * @description Organizes navigation into three clear zones:
 * - "Me" zone: person-level pages (My Profile)
 * - "Company" zone: workspace pages (Updates, Tasks, Team, Settings, etc.)
 * - "Network" zone: community and discovery (Marketplace, Guild, Apprenticeship, Inspiration)
 *
 * Sign Out lives in the footer below What's New.
 * Company switching lives on the My Profile page.
 */
export function Sidebar({ foundryName, foundryId, userName, userRole, isCompanyAdmin, userFoundries }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { setZoom } = useZoomContext()
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
    const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string }) => {
        const isActive = isRouteActive(pathname, item.href)

        const navLink = (
            <Link
                href={item.href}
                className={cn(
                    isActive
                        ? "bg-orange-50 text-international-orange font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    "group flex items-center justify-between px-3 py-2 text-sm transition-all duration-200 rounded-md"
                )}
            >
                <span className="flex items-center">
                    <item.icon
                        className={cn(
                            isActive ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                            "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
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
        <div className="hidden md:flex h-screen w-64 flex-col bg-background border-r border-slate-100 text-foreground">
            {/* App Header — ForgeOS Branding */}
            <div className="px-5 pt-8 pb-4">
                <div className="flex items-center justify-between">
                    <Link href="/updates" className="group flex items-center gap-2">
                        <span className="font-display text-xl font-bold tracking-[0.05em] text-foreground group-hover:text-international-orange transition-colors">
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
                {/* ══════════════════════════════════════════════════ */}
                {/* Zone A: "Me" — Person-level navigation            */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="px-3 pt-2 pb-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Me
                    </p>
                </div>
                {personNavigation.map(renderNavItem)}

                {/* ══════════════════════════════════════════════════ */}
                {/* Zone B: Company — Workspace navigation             */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="my-2 border-t border-slate-100" />

                {/* Company section header — doubles as foundry switcher */}
                <FoundrySwitcher
                    foundries={userFoundries || []}
                    currentFoundryId={foundryId}
                    currentFoundryName={foundryName}
                    userName={userName}
                    userRole={userRole}
                />

                {/* Unread messages indicator */}
                <div className="px-0 pb-1">
                    <UnreadIndicator />
                </div>

                {companyNavigation.map(renderNavItem)}

                {/* ══════════════════════════════════════════════════ */}
                {/* Zone C: "Network" — Community and discovery        */}
                {/* ══════════════════════════════════════════════════ */}
                <div className="my-2 border-t border-slate-100" />

                <div className="px-3 pt-2 pb-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Network
                    </p>
                </div>
                {networkNavigation.map(renderNavItem)}
            </nav>

            {/* Footer — What's New, Zoom, Feedback, Version */}
            <div className="p-4 mt-auto space-y-3 border-t border-slate-100">
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
