/**
 * SectionHeader — Clickable sidebar section label that toggles collapse.
 *
 * @description The entire row is a single click target that toggles the section
 * open/closed. Chevron rotates to indicate state. Hover highlights the row
 * for clear affordance that it's interactive.
 *
 * @param {string} label - Display label (e.g. "Workshop")
 * @param {boolean} [hasNew] - Whether to show the "New" dot
 * @param {boolean} [isOpen] - Whether the section is expanded (for chevron rotation)
 * @param {() => void} [onToggle] - Callback to toggle section collapse
 * @param {string} [className] - Additional CSS classes
 */

"use client"

import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
    /** Section display label */
    label: string
    /** Route prefix for active detection (e.g. "/cash-burn") */
    introRoute: string
    /** Whether unseen features exist in this section */
    hasNew?: boolean
    /** Whether the section is expanded */
    isOpen?: boolean
    /** Callback to toggle section collapse */
    onToggle?: () => void
    /** Additional CSS classes */
    className?: string
}

export function SectionHeader({ label, introRoute, hasNew = false, isOpen, onToggle, className }: SectionHeaderProps): React.ReactElement {
    const pathname = usePathname()
    const isActive = pathname.startsWith(introRoute)

    return (
        <button
            onClick={onToggle}
            className={cn(
                "w-full px-3 pt-1.5 pb-1.5 flex items-center justify-between rounded-md transition-colors",
                onToggle && "cursor-pointer hover:bg-muted/50",
                className,
            )}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${label} section` : `Expand ${label} section`}
        >
            <span
                className={cn(
                    "inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest transition-colors",
                    isActive
                        ? "text-international-orange"
                        : "text-muted-foreground"
                )}
            >
                {label}
                {hasNew && (
                    <span
                        className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse"
                        aria-label={`${label} has new features`}
                    />
                )}
            </span>
            {onToggle && (
                <ChevronRight
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-90"
                    )}
                />
            )}
        </button>
    )
}
