'use client'

import { useState, useEffect } from 'react'

/**
 * FeatureTip - Contextual tooltip for first-visit hints on a page.
 *
 * @description Shows a one-time tooltip near a UI element to help new users
 * discover features. Dismissed with a "Got it" button and remembered via localStorage.
 *
 * @param id - Unique identifier for this tip (used for localStorage key)
 * @param title - Short bold heading for the tip
 * @param description - Detailed guidance text
 * @param children - The element the tip is anchored to
 * @param align - Horizontal alignment of the tooltip ('left' | 'right')
 *
 * @example
 * <FeatureTip
 *   id="tasks-view"
 *   title="Smart Task Management"
 *   description="Use filters and views to find tasks fast."
 * >
 *   <Button>Tasks</Button>
 * </FeatureTip>
 */
export function FeatureTip({
    id,
    title,
    description,
    children,
    align = 'left'
}: {
    id: string
    title: string
    description: string
    children: React.ReactNode
    align?: 'left' | 'right'
}) {
    const [dismissed, setDismissed] = useState(true)
    const storageKey = `forgeos:tip:${id}`

    useEffect(() => {
        try {
            const seen = localStorage.getItem(storageKey)
            if (!seen) {
                setDismissed(false)
            }
        } catch {
            // localStorage not available
        }
    }, [storageKey])

    const handleDismiss = () => {
        try {
            localStorage.setItem(storageKey, 'true')
        } catch {
            // localStorage not available
        }
        setDismissed(true)
    }

    if (dismissed) return <>{children}</>

    const alignmentClass = align === 'right' ? 'right-0' : 'left-0'
    const arrowAlignmentClass = align === 'right' ? 'right-4' : 'left-4'

    return (
        <div className="relative">
            {children}
            <div className={`absolute top-full ${alignmentClass} mt-2 z-50 w-72 p-4 bg-card border-2 border-international-orange rounded-lg shadow-xl animate-in fade-in-50 slide-in-from-top-2`}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-sm text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-xs text-international-orange hover:text-international-orange-hover font-medium shrink-0 px-2 py-1 hover:bg-orange-50 rounded transition-colors"
                    >
                        Got it
                    </button>
                </div>
                <div className={`absolute -top-1.5 ${arrowAlignmentClass} w-3 h-3 bg-card border-l-2 border-t-2 border-international-orange rotate-45`} />
            </div>
        </div>
    )
}
