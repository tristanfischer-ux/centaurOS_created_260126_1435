'use client'

import { cn } from '@/lib/utils'

/**
 * NewIndicator - Pulsing orange dot for unvisited nav items.
 *
 * @description Shows a small animated dot next to sidebar navigation items
 * that the user hasn't visited yet. Creates curiosity and guides exploration
 * during the first 7 days of using ForgeOS.
 *
 * @param show - Whether to show the indicator
 * @param className - Additional CSS classes
 *
 * @example
 * <NewIndicator show={!visitedPages.includes('/marketplace')} />
 */
export function NewIndicator({
    show,
    className,
}: {
    show: boolean
    className?: string
}): React.ReactNode {
    if (!show) return null

    return (
        <span
            className={cn(
                'inline-block h-1.5 w-1.5 rounded-full bg-international-orange',
                'animate-pulse shadow-[0_0_6px_rgba(255,69,0,0.5)]',
                className
            )}
            aria-label="New"
        />
    )
}
