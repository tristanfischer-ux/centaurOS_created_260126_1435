"use client"

/**
 * @file screen-context.tsx
 *
 * @description Provides ambient screen awareness to AI specialists.
 * Pages register what the user is currently looking at, and the
 * BriefSpecialistDialog reads this context to give specialists
 * "eyes" on the screen — even when opened from the sidebar.
 *
 * Two layers of context:
 * 1. Route-based fallback: automatically derived from `usePathname()`
 * 2. Rich page context: explicitly registered by pages via `useRegisterScreenContext`
 *
 * @related
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - AskSpecialistButton: src/components/specialists/ask-specialist-button.tsx
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScreenContextData {
  /** Human-readable label for the current page (e.g. "Strategy Dashboard") */
  pageTitle: string
  /** Route path (e.g. "/strategy") */
  route: string
  /** Summary of what's visible on screen — sent to the AI as ambient context */
  summary: string
  /** Structured details about entities visible on screen */
  entities?: ScreenEntity[]
  /** Timestamp of last registration (to detect stale context) */
  registeredAt: number
}

export interface ScreenEntity {
  /** Type: objective, task, pillar, etc. */
  type: string
  /** Entity title */
  title: string
  /** Optional status or health */
  status?: string
  /** Optional progress percentage */
  progress?: number
}

interface ScreenContextValue {
  /** Current screen context (rich if registered, route-based fallback otherwise) */
  screenContext: ScreenContextData
  /** Pages call this to push rich context about what's on screen */
  registerScreenContext: (data: Omit<ScreenContextData, "route" | "registeredAt">) => void
  /** Serialize the current screen context into a markdown string for the AI */
  serializeScreenContext: () => string
}

// ─── Route fallback map ─────────────────────────────────────────────────────

/** Maps route patterns to human-readable page titles and summaries */
const ROUTE_DESCRIPTIONS: Record<string, { title: string; summary: string }> = {
  "/today": {
    title: "Today (Daily Briefing)",
    summary: "The user is viewing their daily briefing — focus tasks, blockers, pending approvals, and team activity.",
  },
  "/strategy": {
    title: "Strategy Dashboard",
    summary: "The user is viewing the company strategy — strategic pillars, health indicators, and progress across the organization.",
  },
  "/new-objectives": {
    title: "Objectives Board",
    summary: "The user is viewing the objectives board — organizational goals, health scores, and progress tracking.",
  },
  "/new-tasks": {
    title: "Tasks",
    summary: "The user is viewing the task management board — work items, statuses, priorities, and assignments.",
  },
  "/team": {
    title: "Team & Specialists",
    summary: "The user is viewing the team page — organizational structure, team members, roles, and specialist functions.",
  },
  "/messages": {
    title: "Messages",
    summary: "The user is viewing the messaging interface — team conversations and direct messages.",
  },
  "/marketplace": {
    title: "Marketplace",
    summary: "The user is viewing the services marketplace — available offerings, providers, and bookings.",
  },
  "/agents": {
    title: "Specialists Hub",
    summary: "The user is on the specialists landing page — browsing available AI specialists and their capabilities.",
  },
  "/settings": {
    title: "Settings",
    summary: "The user is viewing settings — account configuration, team preferences, and system options.",
  },
  "/strategic-planner": {
    title: "Strategic Planner",
    summary: "The user is viewing the strategic planner for a specific goal — AI suggestions, task breakdown, and progress.",
  },
}

/**
 * Derives a route-based fallback from the pathname when no rich context is registered.
 */
function getRouteDescription(pathname: string): { title: string; summary: string } {
  // Check exact matches first
  if (ROUTE_DESCRIPTIONS[pathname]) {
    return ROUTE_DESCRIPTIONS[pathname]
  }

  // Check prefix matches for nested routes (e.g. /strategic-planner/[id])
  for (const [route, desc] of Object.entries(ROUTE_DESCRIPTIONS)) {
    if (pathname.startsWith(route)) {
      return desc
    }
  }

  return {
    title: "ForgeOS Platform",
    summary: "The user is browsing the ForgeOS platform.",
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

const ScreenContext = createContext<ScreenContextValue | null>(null)

/** Max age in ms before we consider registered context stale and fall back to route */
const STALE_THRESHOLD_MS = 60_000

// ─── Provider ───────────────────────────────────────────────────────────────

/**
 * Wraps the platform layout to provide screen awareness to specialists.
 *
 * @description Tracks what the user is currently looking at. Pages can register
 * rich context, or the provider falls back to route-based descriptions.
 */
export function ScreenContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [richContext, setRichContext] = useState<ScreenContextData | null>(null)

  // Clear rich context when the route changes (user navigated away)
  useEffect(() => {
    setRichContext(null)
  }, [pathname])

  const registerScreenContext = useCallback(
    (data: Omit<ScreenContextData, "route" | "registeredAt">) => {
      setRichContext({
        ...data,
        route: pathname,
        registeredAt: Date.now(),
      })
    },
    [pathname],
  )

  // Resolve: use rich context if fresh and on the same route, otherwise route fallback
  const screenContext: ScreenContextData = (() => {
    if (
      richContext &&
      richContext.route === pathname &&
      Date.now() - richContext.registeredAt < STALE_THRESHOLD_MS
    ) {
      return richContext
    }

    const fallback = getRouteDescription(pathname)
    return {
      pageTitle: fallback.title,
      route: pathname,
      summary: fallback.summary,
      registeredAt: Date.now(),
    }
  })()

  const serializeScreenContext = useCallback((): string => {
    const lines: string[] = []
    lines.push(`## What the User Is Looking At`)
    lines.push(`**Page:** ${screenContext.pageTitle}`)
    lines.push(`**Route:** ${screenContext.route}`)
    lines.push("")
    lines.push(screenContext.summary)

    if (screenContext.entities && screenContext.entities.length > 0) {
      lines.push("")
      lines.push("### Visible Items")
      for (const entity of screenContext.entities.slice(0, 15)) {
        const parts = [`- **${entity.title}**`]
        if (entity.type) parts.push(`(${entity.type})`)
        if (entity.status) parts.push(`— ${entity.status}`)
        if (entity.progress !== undefined) parts.push(`${entity.progress}%`)
        lines.push(parts.join(" "))
      }
      if (screenContext.entities.length > 15) {
        lines.push(`- ... and ${screenContext.entities.length - 15} more`)
      }
    }

    lines.push("")
    lines.push(
      "Reference what the user is looking at when relevant — it shows you understand their current focus.",
    )

    return lines.join("\n")
  }, [screenContext])

  return (
    <ScreenContext.Provider
      value={{ screenContext, registerScreenContext, serializeScreenContext }}
    >
      {children}
    </ScreenContext.Provider>
  )
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Read the current screen context and its serializer.
 *
 * @description Used by BriefSpecialistDialog to inject ambient screen
 * awareness into the specialist's system prompt.
 */
export function useScreenContext(): ScreenContextValue {
  const ctx = useContext(ScreenContext)
  if (!ctx) {
    // Fallback for components rendered outside ScreenContextProvider
    return {
      screenContext: {
        pageTitle: "ForgeOS Platform",
        route: "/",
        summary: "The user is browsing the ForgeOS platform.",
        registeredAt: Date.now(),
      },
      registerScreenContext: () => {},
      serializeScreenContext: () => "",
    }
  }
  return ctx
}

/**
 * Register rich screen context for the current page.
 *
 * @description Call this in page-level components to tell specialists
 * what the user is currently looking at — with structured data about
 * visible entities, stats, and state.
 *
 * @example
 * useRegisterScreenContext({
 *   pageTitle: 'Strategy Dashboard',
 *   summary: '3 strategic pillars. 2 on track, 1 at risk. 68% average progress.',
 *   entities: pillars.map(p => ({
 *     type: 'pillar',
 *     title: p.title,
 *     status: p.health,
 *     progress: p.progress,
 *   })),
 * })
 */
export function useRegisterScreenContext(
  data: Omit<ScreenContextData, "route" | "registeredAt"> | null,
): void {
  const ctx = useContext(ScreenContext)

  useEffect(() => {
    if (ctx && data) {
      ctx.registerScreenContext(data)
    }
    // Re-register when data changes (deps on serialized form to avoid infinite loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, data?.pageTitle, data?.summary])
}
