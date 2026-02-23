/**
 * @file useSectionNewBadge.ts — Hook for section "New" badge logic
 *
 * @description Tracks whether a sidebar section has unseen features by comparing
 * each feature's addedAt date against the user's last visit to that section's
 * intro page. Uses localStorage — no database round-trip needed.
 *
 * @related
 * - Section registry: src/lib/features/section-registry.ts
 * - Sidebar: src/components/Sidebar.tsx
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { SECTIONS, type SectionId } from "@/lib/features/section-registry"

const STORAGE_KEY_PREFIX = "section-seen::"

/**
 * Reads the last-seen timestamp for a section from localStorage.
 *
 * @param sectionId - The section to check
 * @returns The Date the user last visited the section intro, or null if never visited
 */
function getLastSeen(sectionId: SectionId): Date | null {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sectionId}`)
    if (!raw) return null
    const parsed = new Date(raw)
    return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Marks a section as "seen" by writing the current timestamp to localStorage.
 *
 * @param sectionId - The section the user just visited
 */
function markSeen(sectionId: SectionId): void {
    if (typeof window === "undefined") return
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${sectionId}`, new Date().toISOString())
}

/**
 * Checks whether a section has features added after the user's last visit.
 *
 * @param sectionId - The section to check
 * @returns true if there are unseen features
 */
function hasUnseenFeatures(sectionId: SectionId): boolean {
    const section = SECTIONS.find((s) => s.id === sectionId)
    if (!section) return false

    const lastSeen = getLastSeen(sectionId)

    // If the user has never visited this section intro, show "New"
    if (!lastSeen) return true

    // Check if any feature was added after the user's last visit
    return section.features.some((f) => f.addedAt > lastSeen)
}

/**
 * Hook that returns "New" badge state for all sidebar sections.
 *
 * @description Returns a map of sectionId → hasNew, plus a function to mark
 * a section as seen (call this when the user visits a section intro page).
 *
 * @returns {{ badges: Record<SectionId, boolean>, markSectionSeen: (id: SectionId) => void }}
 *
 * @example
 * const { badges, markSectionSeen } = useSectionNewBadges()
 * // badges.workshop === true means Workshop has unseen features
 * // Call markSectionSeen("workshop") when user visits /workshop
 */
export function useSectionNewBadges(): {
    badges: Record<SectionId, boolean>
    markSectionSeen: (id: SectionId) => void
} {
    const [badges, setBadges] = useState<Record<SectionId, boolean>>({
        me: false,
        plan: false,
        finance: false,
        workshop: false,
        marketplace: false,
    })

    // Calculate initial badge state on mount
    useEffect(() => {
        setBadges({
            me: hasUnseenFeatures("me"),
            plan: hasUnseenFeatures("plan"),
            finance: hasUnseenFeatures("finance"),
            workshop: hasUnseenFeatures("workshop"),
            marketplace: hasUnseenFeatures("marketplace"),
        })
    }, [])

    const markSectionSeen = useCallback((sectionId: SectionId) => {
        markSeen(sectionId)
        setBadges((prev) => ({ ...prev, [sectionId]: false }))
    }, [])

    return { badges, markSectionSeen }
}
