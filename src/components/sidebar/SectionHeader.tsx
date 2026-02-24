/**
 * SectionHeader — Clickable sidebar section label that links to the section intro page.
 *
 * @description Renders the section name as a clickable link with an optional "New" dot
 * indicator and a separate chevron toggle for collapsing the section's nav items.
 *
 * Click targets are split:
 * - Label area → navigates to the section intro page
 * - Chevron button → toggles section collapse
 *
 * @param {string} label - Display label (e.g. "Workshop")
 * @param {string} introRoute - Route to the section intro page (e.g. "/workshop")
 * @param {boolean} [hasNew] - Whether to show the "New" dot
 * @param {boolean} [isOpen] - Whether the section is expanded (for chevron rotation)
 * @param {() => void} [onToggle] - Callback to toggle section collapse
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <SectionHeader label="Workshop" introRoute="/workshop" hasNew={true} isOpen={true} onToggle={() => toggle("workshop")} />
 */

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
    /** Section display label */
    label: string
    /** Route to the section intro page */
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
    const isActive = pathname === introRoute

    return (
        <div className={cn("px-3 pt-1 pb-1 flex items-center justify-between", className)}>
            <Link
                href={introRoute}
                className={cn(
                    "group inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest transition-colors",
                    isActive
                        ? "text-international-orange"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                {label}
                {hasNew && (
                    <span
                        className="w-1.5 h-1.5 rounded-full bg-international-orange animate-pulse"
                        aria-label={`${label} has new features`}
                    />
                )}
            </Link>
            {onToggle && (
                <button
                    onClick={onToggle}
                    className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={isOpen ? `Collapse ${label} section` : `Expand ${label} section`}
                >
                    <ChevronRight
                        className={cn(
                            "h-3 w-3 transition-transform duration-200",
                            isOpen && "rotate-90"
                        )}
                    />
                </button>
            )}
        </div>
    )
}
