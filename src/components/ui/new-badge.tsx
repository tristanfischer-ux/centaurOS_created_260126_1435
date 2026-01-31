"use client"

import { cn } from "@/lib/utils"
import { isRouteNew, getFeatureByRoute, isFeatureNew, type Feature } from "@/lib/features/registry"
import { Sparkles } from "lucide-react"

interface NewBadgeProps {
    /** The route to check for "new" status */
    route?: string
    /** Or pass a feature directly */
    feature?: Feature
    /** Size variant */
    size?: 'sm' | 'md'
    /** Custom className */
    className?: string
    /** Show sparkle icon */
    showIcon?: boolean
}

/**
 * New Badge Component
 * 
 * Displays a "New" badge next to navigation items or features that were
 * recently added. Automatically checks the feature registry to determine
 * if the badge should be shown.
 * 
 * Usage:
 * ```tsx
 * <NewBadge route="/settings" />
 * <NewBadge feature={someFeature} />
 * ```
 */
export function NewBadge({ 
    route, 
    feature, 
    size = 'sm',
    className,
    showIcon = false
}: NewBadgeProps) {
    // Determine if we should show the badge
    let shouldShow = false
    
    if (feature) {
        shouldShow = isFeatureNew(feature)
    } else if (route) {
        shouldShow = isRouteNew(route)
    }
    
    if (!shouldShow) return null
    
    return (
        <span 
            className={cn(
                "inline-flex items-center gap-0.5 font-semibold uppercase tracking-wider",
                "bg-gradient-to-r from-international-orange to-orange-500",
                "text-white rounded-full animate-pulse shadow-sm",
                size === 'sm' && "text-[9px] px-1.5 py-0.5",
                size === 'md' && "text-[10px] px-2 py-0.5",
                className
            )}
        >
            {showIcon && <Sparkles className="h-2.5 w-2.5" />}
            New
        </span>
    )
}

/**
 * Wrapper component that adds a "New" badge to any element
 * 
 * Usage:
 * ```tsx
 * <WithNewBadge route="/settings">
 *   <span>Settings</span>
 * </WithNewBadge>
 * ```
 */
export function WithNewBadge({
    route,
    feature,
    children,
    badgePosition = 'right',
    className,
}: {
    route?: string
    feature?: Feature
    children: React.ReactNode
    badgePosition?: 'left' | 'right'
    className?: string
}) {
    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            {badgePosition === 'left' && <NewBadge route={route} feature={feature} />}
            {children}
            {badgePosition === 'right' && <NewBadge route={route} feature={feature} />}
        </span>
    )
}

/**
 * Hook to check if a route is new (for conditional rendering)
 */
export function useIsRouteNew(route: string): boolean {
    return isRouteNew(route)
}

/**
 * Get the feature data for a route (for tooltips, etc.)
 */
export function useFeatureData(route: string): Feature | undefined {
    return getFeatureByRoute(route)
}
