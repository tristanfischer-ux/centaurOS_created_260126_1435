"use client"

import React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Users, CheckSquare, Store, Target, ShieldAlert, Lightbulb, ShoppingBag, Bot, Home, Bell, Sparkles, Waypoints, MessageSquarePlus, Plus, Map, Calculator, Banknote, Rocket } from "lucide-react"
import { NotificationCenter } from "@/components/NotificationCenter"
import { UnreadIndicator } from "@/components/today/UnreadIndicator"
import { FoundrySwitcher } from "@/components/FoundrySwitcher"
// ThemeToggle removed - ForgeOS enforces light mode per design philosophy
import { FocusModeToggle } from "@/components/FocusModeToggle"
import { ZoomControl } from "@/components/ZoomControl"
import { useZoomContext } from "@/components/ZoomProvider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NewBadge } from "@/components/ui/new-badge"
import { BetaBadge } from "@/components/ui/beta-badge"
import { AccountPopover } from "@/components/account-popover"
import { FeedbackDialog } from "@/components/feedback/feedback-dialog"
import { QuickCaptureDialog } from "@/components/smart/quick-capture-dialog"
import { isRouteBeta, getFeatureNameByRoute } from "@/lib/features/registry"
import type { SmartGoalSuggestion } from "@/actions/smart-goals"

/**
 * Determines if a navigation item should be marked as active
 * Uses exact matching for root routes and prefix matching for nested routes
 */
function isRouteActive(pathname: string, href: string): boolean {
    // Exact match for root-level routes
    if (pathname === href) return true

    // For nested routes, check if pathname starts with href followed by /
    // This prevents /dashboard from matching /dashboard-settings
    if (pathname.startsWith(href + '/')) return true

    return false
}

// Keep in sync with package.json version
const APP_VERSION = "0.9.0"

// Work: day-to-day operations
const workNavigation = [
    { name: "Home", href: "/dashboard", icon: Home, tooltip: "Your personalized command center with insights and quick actions" },
    { name: "Updates", href: "/updates", icon: Bell, tooltip: "Notes, comments, and changes across your tasks and objectives" },
    { name: "Objectives", href: "/new-objectives", icon: Target, tooltip: "Set and track high-level strategic goals" },
    { name: "Tasks", href: "/new-tasks", icon: CheckSquare, tooltip: "Manage and assign actionable items" },
    { name: "Team", href: "/team", icon: Users, tooltip: "Team members, roles, and capacity" },
    { name: "Agents", href: "/agents", icon: Bot, tooltip: "Prompt workflows — build, chain, and copy prompts" },
    { name: "Canvas", href: "/canvas", icon: Waypoints, tooltip: "Visual map of objectives, tasks, and their relationships" },
    { name: "Strategy", href: "/strategic-planner", icon: Map, tooltip: "Strategic timeline planner — backward-plan from goals with AI" },
]

// Discovery: finding help and resources
const discoveryNavigation = [
    { name: "Inspiration", href: "/inspiration", icon: Lightbulb, tooltip: "Get ideas on what to do next and discover opportunities" },
    { name: "Marketplace", href: "/marketplace", icon: Store, tooltip: "Find experts, suppliers, products, and services" },
    { name: "My Orders", href: "/my-orders", icon: ShoppingBag, tooltip: "View and manage your marketplace orders" },
    { name: "What's New", href: "/whats-new", icon: Sparkles, tooltip: "Latest features, improvements, and product updates" },
]

// Tools: financial calculators and utilities
const toolsNavigation = [
    { name: "Launchpad", href: "/launchpad", icon: Rocket, tooltip: "Step-by-step guide to launching and growing your business" },
    { name: "Money Map", href: "/money-map", icon: Banknote, tooltip: "Visualise how you make money, where you spend it, and true profitability by stream" },
    { name: "Cost of Delay", href: "/tools/cost-of-delay", icon: Calculator, tooltip: "Visualize whether spending to ship faster saves you money" },
]

// Profile & Settings moved to AccountPopover (accessed via user avatar)

interface FoundryInfo {
    foundryId: string
    foundryName: string
    role: string
    isPrimary: boolean
    isActive: boolean
    memberCount: number
}

export function Sidebar({ foundryName, foundryId, userName, userRole, isCompanyAdmin, userFoundries }: { foundryName?: string; foundryId?: string; userName?: string; userRole?: string; isCompanyAdmin?: boolean; userFoundries?: FoundryInfo[] }) {
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

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-background border-r border-slate-100 text-foreground">
            {/* App Header - Fractional Forge Branding */}
            <div className="px-5 pt-8 pb-6">
                <div className="flex items-center justify-between">
                    <Link href="/dashboard" className="group flex items-center gap-2">
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

            {/* Foundry & User Info - With Multi-Foundry Switcher */}
            <FoundrySwitcher
                foundries={userFoundries || []}
                currentFoundryId={foundryId}
                currentFoundryName={foundryName}
                userName={userName}
                userRole={userRole}
            />
            {/* Account menu (My Profile, Settings, Sign Out) */}
            <div className="px-4 pb-2">
                <AccountPopover userName={userName} userRole={userRole} />
            </div>
            {/* Unread messages indicator */}
            <div className="px-4 pb-4">
                <UnreadIndicator />
            </div>

            <nav className="flex-1 space-y-1.5 px-3 py-3">
                {/* Helper function to render nav items */}
                {(() => {
                    const renderNavItem = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }>; tooltip?: string }) => {
                        const isActive = isRouteActive(pathname, item.href)
                        const isBeta = isRouteBeta(item.href)
                        
                        // Determine which badge to show
                        // Priority: Beta badge > Demo badge > New badge
                        let badgeContent = null
                        
                        if (isBeta) {
                            // Show beta badge with feedback click handler
                            const featureName = getFeatureNameByRoute(item.href)
                            badgeContent = (
                                <BetaBadge onClick={() => openFeedback(featureName)} />
                            )
                        } else if (item.href === '/marketplace') {
                            // Show "Demo" badge for Marketplace
                            badgeContent = <NewBadge customText="Demo" />
                        } else if (item.href !== '/objectives' && item.href !== '/settings') {
                            // Show "New" badge only for routes other than objectives and settings
                            badgeContent = <NewBadge route={item.href} />
                        }
                        
                        const navLink = (
                            <Link
                                href={item.href}
                                className={cn(
                                    isActive
                                        ? "bg-orange-50 text-international-orange font-semibold"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    "group flex items-center justify-between px-3 py-2.5 text-sm transition-all duration-200 rounded-md"
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
                                {badgeContent}
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
                        <>
                            {/* Work: Home, Objectives, Tasks, Team */}
                            {workNavigation.map(renderNavItem)}
                            
                            {/* Spacer */}
                            <div className="my-3 border-t border-slate-100" />
                            
                            {/* Discovery: Product Map, Marketplace */}
                            {discoveryNavigation.map(renderNavItem)}
                            
                            {/* Spacer */}
                            <div className="my-3 border-t border-slate-100" />
                            
                            {/* Tools: Calculators & Utilities */}
                            {toolsNavigation.map(renderNavItem)}
                        </>
                    )
                })()}

                {/* Company Admin Link - Only visible to Founders/Executives */}
                {isCompanyAdmin && (
                    <>
                        <div className="my-4 border-t border-slate-100" />
                        <Link
                            href="/admin"
                            className={cn(
                                isRouteActive(pathname, "/admin")
                                    ? "bg-orange-50 text-international-orange font-semibold"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                "group flex items-center px-3 py-2.5 text-sm transition-all duration-200 rounded-md"
                            )}
                        >
                            <ShieldAlert
                                className={cn(
                                    isRouteActive(pathname, "/admin") ? "text-international-orange" : "text-muted-foreground group-hover:text-foreground",
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors"
                                )}
                                aria-hidden="true"
                            />
                            Company Admin
                        </Link>
                    </>
                )}
            </nav>

            <div className="p-4 mt-auto space-y-3">
                {/* Zoom Control */}
                <div className="flex justify-center">
                    <ZoomControl onZoomChange={setZoom} />
                </div>

                {/* Early Access badge + Feedback + Version */}
                <div className="space-y-2">
                    {/* Early Access badge */}
                    <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-international-orange/10 text-international-orange text-[10px] font-semibold tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse" />
                            Early Access
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono opacity-60">
                            v{APP_VERSION}
                        </span>
                    </div>
                    
                    {/* Feedback + Search shortcuts */}
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

            {/* Quick Capture Dialog - Global idea capture */}
            <QuickCaptureDialog
                open={isQuickCaptureOpen}
                onOpenChange={setIsQuickCaptureOpen}
                onCreateObjective={handleCaptureObjective}
                onCreateTask={handleCaptureTask}
            />
        </div>
    )
}
