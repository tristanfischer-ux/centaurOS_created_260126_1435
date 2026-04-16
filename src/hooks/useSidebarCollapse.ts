/**
 * @file useSidebarCollapse.ts — Hook for sidebar section collapse state
 *
 * @description Manages which sidebar sections are expanded/collapsed.
 * Maps the current route to its owning section and auto-expands it.
 * Persists manual toggle state to localStorage.
 *
 * @related
 * - Section registry: src/lib/features/section-registry.ts
 * - Sidebar: src/components/Sidebar.tsx
 * - New badge hook: src/hooks/useSectionNewBadge.ts
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SectionId } from "@/lib/features/section-registry"

const STORAGE_KEY = "sidebar-collapse-state"

type OpenSections = Record<SectionId, boolean>

const ALL_OPEN: OpenSections = {
    me: true,
    supplier: true,
    plan: true,
    finance: true,
    cashBurn: true,
    workshop: true,
    marketplace: true,
}

// ─── Route → Section Mapping ────────────────────────────────────────────────

/**
 * Route prefixes/exact matches for each section. Order matters —
 * more specific prefixes should come before generic ones.
 */
const SECTION_ROUTES: { sectionId: SectionId; routes: string[] }[] = [
    {
        sectionId: "me",
        routes: ["/today", "/my-profile", "/updates", "/knowledge", "/google-apps", "/me"],
    },
    {
        sectionId: "supplier",
        routes: ["/supplier"],
    },
    {
        sectionId: "plan",
        routes: ["/strategy", "/new-objectives", "/new-tasks", "/outreach", "/reports", "/plan", "/canvas"],
    },
    {
        sectionId: "finance",
        routes: ["/finance"],
    },
    {
        sectionId: "cashBurn",
        routes: ["/cash-burn", "/cash-out", "/cash-in", "/pnl", "/investors", "/fundraise"],
    },
    {
        sectionId: "workshop",
        routes: ["/the-forge", "/team", "/agents", "/browse", "/learn", "/workshop"],
    },
    {
        sectionId: "marketplace",
        routes: ["/recruits", "/guild", "/apprenticeship", "/marketplace", "/marketplace-orders", "/marketplace-hub"],
    },
]

/**
 * Resolves a pathname to the sidebar section that owns it.
 *
 * @param pathname - Current Next.js pathname
 * @returns The owning SectionId, or null if no section matches
 */
function getSectionForRoute(pathname: string): SectionId | null {
    for (const { sectionId, routes } of SECTION_ROUTES) {
        for (const route of routes) {
            if (pathname === route || pathname.startsWith(route + "/")) {
                return sectionId
            }
        }
    }
    return null
}

/**
 * Reads persisted collapse state from localStorage.
 *
 * @returns The stored state, or null if nothing stored / invalid
 */
function readStorage(): OpenSections | null {
    if (typeof window === "undefined") return null
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as OpenSections
        // Validate shape — must have all 5 section keys
        const ids: SectionId[] = ["me", "supplier", "plan", "finance", "cashBurn", "workshop", "marketplace"]
        if (ids.every((id) => typeof parsed[id] === "boolean")) {
            return parsed
        }
        return null
    } catch {
        return null
    }
}

/**
 * Persists collapse state to localStorage.
 */
function writeStorage(state: OpenSections): void {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
        // Silently ignore quota errors
    }
}

/**
 * Hook that manages sidebar section collapse/expand state.
 *
 * @description
 * - During SSR: all sections open (prevents hydration mismatch)
 * - On mount: reads localStorage. First-time visitors get only the active section open.
 * - On pathname change: auto-expands the section matching the current route
 * - On manual toggle: updates state and persists to localStorage
 *
 * @param pathname - Current Next.js pathname from usePathname()
 * @returns {{ openSections: OpenSections, toggleSection: (id: SectionId) => void }}
 */
export function useSidebarCollapse(pathname: string): {
    openSections: OpenSections
    toggleSection: (id: SectionId) => void
} {
    // INTENT: Default all-open during SSR to prevent layout flash on hydration.
    // The useEffect on mount applies the real state from localStorage.
    const [openSections, setOpenSections] = useState<OpenSections>(ALL_OPEN)
    const hasMounted = useRef(false)

    // On mount: apply stored state (or first-time defaults)
    useEffect(() => {
        const stored = readStorage()
        if (stored) {
            // Ensure the active section is open
            const activeSection = getSectionForRoute(pathname)
            const next = activeSection ? { ...stored, [activeSection]: true } : stored
            setOpenSections(next)
        } else {
            // First-time visitor: only the active section open
            const activeSection = getSectionForRoute(pathname)
            const initial: OpenSections = {
                me: activeSection === "me",
                supplier: activeSection === "supplier",
                plan: activeSection === "plan",
                finance: activeSection === "finance",
                cashBurn: activeSection === "cashBurn",
                workshop: activeSection === "workshop",
                marketplace: activeSection === "marketplace",
            }
            // If no section matches (e.g. /settings), open "me" as default
            if (!activeSection) initial.me = true
            setOpenSections(initial)
            writeStorage(initial)
        }
        hasMounted.current = true
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // On pathname change (after mount): auto-expand the active section
    useEffect(() => {
        if (!hasMounted.current) return
        const activeSection = getSectionForRoute(pathname)
        if (!activeSection) return

        setOpenSections((prev) => {
            if (prev[activeSection]) return prev
            const next = { ...prev, [activeSection]: true }
            writeStorage(next)
            return next
        })
    }, [pathname])

    const toggleSection = useCallback((id: SectionId) => {
        setOpenSections((prev) => {
            const next = { ...prev, [id]: !prev[id] }
            writeStorage(next)
            return next
        })
    }, [])

    return { openSections, toggleSection }
}
