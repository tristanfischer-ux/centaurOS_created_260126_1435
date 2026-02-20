"use client"

/**
 * @file screen-context.tsx
 *
 * @description Provides ambient screen awareness to AI specialists.
 * Pages register what the user is currently looking at, and the
 * BriefSpecialistDialog reads this context to give specialists
 * "eyes" on the screen — even when opened from the sidebar.
 *
 * Three layers of context:
 * 1. Route-based fallback: automatically derived from `usePathname()`
 * 2. Rich page context: explicitly registered by pages via `useRegisterScreenContext`
 * 3. Page knowledge: automatically injected from the page-knowledge registry
 *    (available actions, getting started steps, workflows)
 *
 * @related
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - AskSpecialistButton: src/components/specialists/ask-specialist-button.tsx
 * - Page knowledge registry: src/lib/page-knowledge.ts
 * - Visit tracker: src/lib/page-visit-tracker.ts
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { getPageKnowledge, serializePageKnowledge } from "@/lib/page-knowledge"
import type { PageFeature } from "@/lib/page-knowledge"
import { isFirstPageVisit, markPageVisited } from "@/lib/page-visit-tracker"

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
  /** Available features/actions on this page (auto-injected from page-knowledge registry) */
  availableActions?: PageFeature[]
  /** Recommended first steps for new users (auto-injected from page-knowledge registry) */
  gettingStarted?: string[]
  /** Whether this is the user's first visit to this page */
  isFirstVisit?: boolean
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
  // The Forge & CAD Lab pipeline
  "/the-forge": {
    title: "The Forge",
    summary: "The user is in The Forge — turning product ideas into manufacturing-ready packages.",
  },
  "/the-forge/cad-lab": {
    title: "The Forge — Research",
    summary: "The user is in the CAD Lab research stage — defining what to build and running AI-powered engineering research.",
  },
  "/the-forge/cad-lab/build": {
    title: "The Forge — Build",
    summary: "The user is in the CAD Lab build stage — decomposing a product into modules and generating parametric CAD for each.",
  },
  "/the-forge/cad-lab/analysis": {
    title: "The Forge — Analysis",
    summary: "The user is viewing engineering analysis — risk register, timeline, and design quality metrics.",
  },
  "/the-forge/cad-lab/procurement": {
    title: "The Forge — Procurement",
    summary: "The user is in procurement — supply chain diagnostics, cost estimation, and contracting.",
  },
  "/the-forge/cad-lab/review": {
    title: "The Forge — Review",
    summary: "The user is reviewing the final package — supplier-ready documentation and expert discipline matching.",
  },
  "/the-forge/components": {
    title: "Component Library",
    summary: "The user is browsing the component library — parametric parts with specs and pricing.",
  },
  "/the-forge/assembly-builder": {
    title: "Assembly Builder",
    summary: "The user is in the assembly builder — combining components into assemblies.",
  },
  "/knowledge": {
    title: "Knowledge Vault",
    summary: "The user is viewing the knowledge vault — organizational notes and documents.",
  },
  "/updates": {
    title: "Activity Feed",
    summary: "The user is viewing the activity feed — recent changes across the organization.",
  },
  "/browse": {
    title: "In-App Browser",
    summary: "The user is using the in-app browser — researching external content.",
  },
  "/guild": {
    title: "Guild Hub",
    summary: "The user is viewing the guild hub — community events and peer learning.",
  },
  "/apprenticeship": {
    title: "Apprenticeship",
    summary: "The user is on the apprenticeship dashboard — training progress and OTJT.",
  },
  "/recruits": {
    title: "People Marketplace",
    summary: "The user is browsing the people marketplace — finding talent and recommendations.",
  },
  "/marketplace-orders": {
    title: "Orders",
    summary: "The user is viewing orders — tracking active and completed bookings.",
  },
  "/provider-portal": {
    title: "Provider Portal",
    summary: "The user is in the provider portal — managing listings and availability.",
  },
  "/retainers": {
    title: "Retainers",
    summary: "The user is viewing retainers — ongoing service engagements.",
  },
  "/rfq": {
    title: "RFQ",
    summary: "The user is viewing requests for quotation.",
  },
  "/advisory": {
    title: "Advisory",
    summary: "The user is viewing advisory — expert guidance and reviews.",
  },
  "/inspiration": {
    title: "Inspiration Hub",
    summary: "The user is in the inspiration hub — templates and packs.",
  },
  "/the-forge/new": {
    title: "The Forge — New Design",
    summary: "The user is creating a new design concept — describing what they want to build.",
  },
  "/the-forge/cad-lab/mashup": {
    title: "The Forge — Mashup Lab",
    summary: "The user is in the Mashup Lab — uploading and merging existing STEP files into a unified hybrid design.",
  },
  "/the-forge/cad-lab/templates": {
    title: "The Forge — Templates",
    summary: "The user is browsing design templates — pre-built starting points for common products.",
  },
  "/settings/company": {
    title: "Company Settings",
    summary: "The user is configuring company-level settings — foundry name, logo, and organizational details.",
  },
  "/settings/billing": {
    title: "Billing Settings",
    summary: "The user is managing billing — subscription plan, payment methods, and invoices.",
  },
  "/settings/intelligence": {
    title: "AI Intelligence Settings",
    summary: "The user is configuring AI intelligence preferences — model selection, specialist behavior, and data permissions.",
  },
  "/settings/help": {
    title: "Help & Support",
    summary: "The user is viewing help and support resources — documentation, FAQs, and contact options.",
  },
  "/provider-portal/pricing": {
    title: "Provider Portal — Pricing",
    summary: "The user is setting pricing for their marketplace listings — rates, packages, and terms.",
  },
  "/provider-portal/analytics": {
    title: "Provider Portal — Analytics",
    summary: "The user is viewing provider analytics — engagement, bookings, and revenue metrics.",
  },
  "/provider-portal/case-studies": {
    title: "Provider Portal — Case Studies",
    summary: "The user is managing case studies — showcasing past work and results for potential clients.",
  },
  "/provider-portal/settings": {
    title: "Provider Portal — Settings",
    summary: "The user is configuring provider settings — profile, notifications, and account preferences.",
  },
  "/provider-portal/discovery-calls": {
    title: "Provider Portal — Discovery Calls",
    summary: "The user is managing discovery calls — scheduling availability and reviewing incoming requests.",
  },
  "/provider-portal/apply": {
    title: "Provider Portal — Apply",
    summary: "The user is applying to become a marketplace provider — filling out their application.",
  },
  "/provider-portal/availability": {
    title: "Provider Portal — Availability",
    summary: "The user is setting availability — when they're open for bookings and engagements.",
  },
  "/provider-portal/profile": {
    title: "Provider Portal — Profile",
    summary: "The user is editing their provider profile — bio, expertise, and credentials.",
  },
  "/provider-portal/listing": {
    title: "Provider Portal — Listing",
    summary: "The user is managing their marketplace listing — service description, pricing, and media.",
  },
  "/provider-portal/payments": {
    title: "Provider Portal — Payments",
    summary: "The user is managing provider payments — Stripe Connect setup, payout history, and earnings.",
  },
  "/provider-portal/portfolio": {
    title: "Provider Portal — Portfolio",
    summary: "The user is managing their portfolio — work samples, project history, and testimonials.",
  },
  "/tools/cost-of-delay": {
    title: "Cost of Delay Calculator",
    summary: "The user is using the cost-of-delay calculator — estimating the financial impact of delaying work.",
  },
  "/tools/financial": {
    title: "Financial Tools",
    summary: "The user is using financial planning tools — projections, burn rate, and runway calculations.",
  },
  "/money-map": {
    title: "Money Map",
    summary: "The user is viewing the money map — financial overview, revenue streams, and cost structure.",
  },
  "/analytics": {
    title: "Analytics",
    summary: "The user is viewing analytics — performance metrics, usage data, and trends.",
  },
  "/timeline": {
    title: "Timeline",
    summary: "The user is viewing the timeline — chronological view of milestones, events, and progress.",
  },
  "/team/new": {
    title: "Invite Team Member",
    summary: "The user is inviting a new team member — entering their details and role.",
  },
  "/talent": {
    title: "Talent",
    summary: "The user is browsing talent — finding people and skill sets for their team.",
  },
  "/my-profile": {
    title: "My Profile",
    summary: "The user is viewing their own profile — personal details, role, and activity history.",
  },
  "/me": {
    title: "My Account",
    summary: "The user is viewing their account — personal settings and preferences.",
  },
  "/objectives": {
    title: "Objectives",
    summary: "The user is viewing objectives — organizational goals and key results.",
  },
  "/tasks": {
    title: "Tasks",
    summary: "The user is viewing the task list — work items, statuses, and assignments.",
  },
  "/org-blueprint": {
    title: "Organizational Blueprint",
    summary: "The user is viewing the org blueprint — organizational structure, roles, and coverage analysis.",
  },
  "/pitch-prep": {
    title: "Pitch Prep",
    summary: "The user is in pitch preparation — building investor decks, rehearsing, and refining their story.",
  },
  "/pitch-prep/create": {
    title: "Create Pitch",
    summary: "The user is creating a new pitch — defining audience, narrative, and key messages.",
  },
  "/plan": {
    title: "Plan",
    summary: "The user is viewing a plan — structured action items and milestones.",
  },
  "/marketplace-hub": {
    title: "Marketplace Hub",
    summary: "The user is viewing the marketplace hub — centralized view of all marketplace activity.",
  },
  "/marketplace-v2": {
    title: "Marketplace",
    summary: "The user is browsing the marketplace — finding services, experts, and suppliers.",
  },
  "/marketplace-setup": {
    title: "Marketplace Setup",
    summary: "The user is setting up their marketplace presence — configuring listings and provider profile.",
  },
  "/orders": {
    title: "Orders",
    summary: "The user is viewing orders — tracking purchases, deliveries, and fulfillment.",
  },
  "/my-orders": {
    title: "My Orders",
    summary: "The user is viewing their personal orders — purchases and booking history.",
  },
  "/rfq/create": {
    title: "Create RFQ",
    summary: "The user is creating a request for quotation — specifying requirements for suppliers to bid on.",
  },
  "/retainers/new": {
    title: "New Retainer",
    summary: "The user is setting up a new retainer — ongoing service engagement with a provider.",
  },
  "/buyer": {
    title: "Buyer Dashboard",
    summary: "The user is in the buyer dashboard — managing procurement, RFQs, and supplier relationships.",
  },
  "/buyer/analytics": {
    title: "Buyer Analytics",
    summary: "The user is viewing buyer analytics — procurement spend, supplier performance, and savings.",
  },
  "/provider-signup": {
    title: "Provider Signup",
    summary: "The user is signing up as a marketplace provider — creating their provider account.",
  },
  "/saved-resources": {
    title: "Saved Resources",
    summary: "The user is viewing saved resources — bookmarked providers, listings, and content.",
  },
  "/inbox": {
    title: "Inbox",
    summary: "The user is viewing their inbox — notifications, messages, and action items.",
  },
  "/new-inbox": {
    title: "Inbox",
    summary: "The user is viewing their inbox — notifications, messages, and action items requiring attention.",
  },
  "/canvas": {
    title: "Canvas",
    summary: "The user is in the canvas workspace — visual collaboration, whiteboarding, and brainstorming.",
  },
  "/workshop": {
    title: "Workshop",
    summary: "The user is in the workshop — hands-on tools for building and prototyping ideas.",
  },
  "/product-xray": {
    title: "Product X-Ray",
    summary: "The user is using Product X-Ray — deep analysis of a physical product from photos or descriptions.",
  },
  "/agents/artifacts": {
    title: "Specialist Artifacts",
    summary: "The user is viewing specialist artifacts — documents, analyses, and outputs created by AI specialists.",
  },
  "/home": {
    title: "Home",
    summary: "The user is on the home page — overview of their foundry activity and quick navigation.",
  },
  "/dashboard": {
    title: "Dashboard",
    summary: "The user is on the dashboard — high-level view of foundry metrics and activity.",
  },
  "/admin": {
    title: "Admin",
    summary: "The user is in the admin panel — system administration and management tools.",
  },
  "/admin/waitlist": {
    title: "Admin — Waitlist",
    summary: "The user is managing the waitlist — reviewing and approving signups.",
  },
  "/help": {
    title: "Help",
    summary: "The user is viewing the help center — documentation, guides, and support resources.",
  },
  "/whats-new": {
    title: "What's New",
    summary: "The user is viewing the changelog — recent updates, new features, and improvements to ForgeOS.",
  },
  "/google-apps": {
    title: "Google Apps Integration",
    summary: "The user is managing Google Apps integration — connecting Google Workspace services.",
  },
}

/** Returns true if the segment looks like a UUID or other dynamic route param */
function isUuidLike(segment: string): boolean {
  if (segment.length < 8) return false
  const hexOrDash = /^[a-fA-F0-9-]+$/.test(segment)
  const looksLikeId = segment.length > 12 || (hexOrDash && segment.length >= 8)
  return looksLikeId
}

/**
 * Derives a meaningful title and summary from the URL pathname when no explicit
 * route description exists. Ensures every page gets usable context for specialists.
 */
function deriveFromPathname(pathname: string): { title: string; summary: string } {
  const segments = pathname.split("/").filter(Boolean)
  const meaningful = segments.filter((s) => !isUuidLike(s))
  const titleParts = meaningful.map((s) =>
    s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  )
  const title = titleParts.join(" > ") || "ForgeOS Platform"
  const lastPart = titleParts[titleParts.length - 1] || "a page"
  return {
    title,
    summary: `The user is viewing ${lastPart} on the ForgeOS platform.`,
  }
}

/**
 * Derives a route-based fallback from the pathname when no rich context is registered.
 */
function getRouteDescription(pathname: string): { title: string; summary: string } {
  // Check exact matches first
  if (ROUTE_DESCRIPTIONS[pathname]) {
    return ROUTE_DESCRIPTIONS[pathname]
  }

  // Check prefix matches for nested routes — use longest matching prefix
  let best: { route: string; desc: { title: string; summary: string } } | null = null
  for (const [route, desc] of Object.entries(ROUTE_DESCRIPTIONS)) {
    if (pathname.startsWith(route) && (!best || route.length > best.route.length)) {
      best = { route, desc }
    }
  }
  if (best) return best.desc

  return deriveFromPathname(pathname)
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
  const [firstVisitFlag, setFirstVisitFlag] = useState(false)

  // Clear rich context when the route changes (user navigated away)
  // Also check first-visit status and mark the page as visited
  useEffect(() => {
    setRichContext(null)

    // Check first-visit status before marking (client-side only)
    if (typeof window !== "undefined") {
      const isFirst = isFirstPageVisit(pathname)
      setFirstVisitFlag(isFirst)
      // Mark visited after a short delay so the flag is captured first
      const timer = setTimeout(() => markPageVisited(pathname), 500)
      return () => clearTimeout(timer)
    }
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

  // Auto-inject page knowledge from the registry
  const pageKnowledge = useMemo(() => getPageKnowledge(pathname), [pathname])

  // Resolve: use rich context if fresh and on the same route, otherwise route fallback
  // Then enrich with page knowledge and first-visit status
  const screenContext: ScreenContextData = (() => {
    let base: ScreenContextData

    if (
      richContext &&
      richContext.route === pathname &&
      Date.now() - richContext.registeredAt < STALE_THRESHOLD_MS
    ) {
      base = richContext
    } else {
      const fallback = getRouteDescription(pathname)
      base = {
        pageTitle: fallback.title,
        route: pathname,
        summary: fallback.summary,
        registeredAt: Date.now(),
      }
    }

    // Enrich with page knowledge (auto-injected, pages don't need to register this)
    return {
      ...base,
      availableActions: base.availableActions ?? pageKnowledge?.features,
      gettingStarted: base.gettingStarted ?? pageKnowledge?.gettingStarted,
      isFirstVisit: firstVisitFlag,
    }
  })()

  const serializeScreenContext = useCallback((): string => {
    const lines: string[] = []
    lines.push(`## Screen Awareness (Live)`)
    lines.push(
      `You can see what the user is looking at right now. This is your live view of their screen.`,
    )
    lines.push("")
    lines.push(`**Page:** ${screenContext.pageTitle}`)
    lines.push(`**Route:** ${screenContext.route}`)
    if (screenContext.isFirstVisit) {
      lines.push(`**First Visit:** Yes — the user has never been to this page before.`)
    }
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

    // Inject page knowledge (available actions, getting started, workflows)
    if (pageKnowledge) {
      lines.push("")
      lines.push(serializePageKnowledge(pageKnowledge))
    }

    lines.push("")
    lines.push(
      "You have real-time screen awareness. If the user asks whether you can see their screen, confirm that you can and reference specific details from above to prove it. Proactively reference what they're looking at when relevant.",
    )

    return lines.join("\n")
  }, [screenContext, pageKnowledge])

  // Memoize the provider value to prevent unnecessary consumer re-renders.
  // Without this, every setRichContext call creates a new value object,
  // which triggers all consumers to re-render even if the data they use hasn't changed.
  const value = useMemo(
    () => ({ screenContext, registerScreenContext, serializeScreenContext }),
    [screenContext, registerScreenContext, serializeScreenContext],
  )

  return (
    <ScreenContext.Provider value={value}>
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
  // Extract the stable callback (wrapped in useCallback in the provider)
  // to avoid depending on the entire context value object, which changes
  // every render and would cause an infinite re-render loop.
  const register = ctx?.registerScreenContext

  useEffect(() => {
    if (register && data) {
      register(data)
    }
    // Re-register when data changes (deps on serialized form to avoid infinite loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, data?.pageTitle, data?.summary])
}
