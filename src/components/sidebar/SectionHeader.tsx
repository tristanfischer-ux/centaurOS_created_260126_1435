/**
 * SectionHeader — Clickable sidebar section label that links to the section intro page.
 *
 * @description Renders the section name as a clickable link with an optional "New" dot
 * indicator. When features are added to a section after the user's last visit, the dot
 * appears to draw attention. Clicking navigates to the section's intro page.
 *
 * @param {string} label - Display label (e.g. "Workshop")
 * @param {string} introRoute - Route to the section intro page (e.g. "/workshop")
 * @param {boolean} [hasNew] - Whether to show the "New" dot
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <SectionHeader label="Workshop" introRoute="/workshop" hasNew={true} />
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
    /** Additional CSS classes */
    className?: string
}

export function SectionHeader({ label, introRoute, hasNew = false, className }: SectionHeaderProps): React.ReactElement {
    const pathname = usePathname()
    const isActive = pathname === introRoute

    return (
        <div className={cn("px-3 pt-2 pb-1.5", className)}>
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
                <ChevronRight className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
            </Link>
        </div>
    )
}
