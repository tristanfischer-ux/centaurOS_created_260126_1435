/**
 * @file route-specialist-map.ts
 *
 * @description Maps platform routes to the most relevant AI specialist.
 * Used by FloatingSpecialistFAB to show the right specialist avatar on each page.
 * Defaults to Chief of Staff (Cal) when no specific specialist matches.
 *
 * @related
 * - FloatingSpecialistFAB: src/components/specialists/floating-specialist-fab.tsx
 * - Specialists data: src/app/(platform)/agents/specialists-data.ts
 */

import type { SpecialistId } from "@/lib/agents/specialists-config"

/** Default specialist when no route matches (general operations, coordination) */
const DEFAULT_SPECIALIST: SpecialistId = "chief-of-staff"

/**
 * Route-to-specialist mapping. More specific patterns must appear before broader ones
 * since we use first-match. Prefix patterns (e.g. /team*) match any path starting
 * with that prefix.
 *
 * Order matters: exact matches and longer prefixes should come before shorter ones.
 */
const ROUTE_SPECIALIST_MAP: Array<{
  /** Route pattern: exact path or prefix (no trailing slash for exact) */
  pattern: string
  /** Specialist ID for this route */
  specialistId: SpecialistId
}> = [
  // Exact and specific paths first
  { pattern: "/today", specialistId: "chief-of-staff" },
  { pattern: "/strategy", specialistId: "strategist" },
  { pattern: "/new-objectives", specialistId: "strategist" },
  { pattern: "/new-tasks", specialistId: "chief-of-staff" },
  { pattern: "/analytics", specialistId: "finance-lead" },
  { pattern: "/org-blueprint", specialistId: "chief-of-staff" },
  { pattern: "/playbooks", specialistId: "strategist" },
  { pattern: "/learn", specialistId: "strategist" },
  { pattern: "/messages", specialistId: "chief-of-staff" },
  { pattern: "/outreach", specialistId: "sales-lead" },
  { pattern: "/knowledge", specialistId: "strategist" },
  { pattern: "/recruits", specialistId: "hiring-team" },
  { pattern: "/investors", specialistId: "fundraising-advisor" },
  { pattern: "/fundraise", specialistId: "fundraising-advisor" },
  { pattern: "/apprenticeship", specialistId: "hiring-team" },
  // Prefix patterns (more specific before broader)
  { pattern: "/the-forge/cad-lab/specify", specialistId: "vp-manufacturing" },
  { pattern: "/the-forge/cad-lab/source", specialistId: "vp-supply-chain" },
  { pattern: "/the-forge/cad-lab/assemble", specialistId: "vp-engineering" },
  { pattern: "/the-forge/cad-lab", specialistId: "cto" },
  { pattern: "/the-forge", specialistId: "product-lead" },
  { pattern: "/strategic-planner", specialistId: "strategist" },
  { pattern: "/team", specialistId: "hiring-team" },
  { pattern: "/marketplace", specialistId: "vp-supply-chain" },
  { pattern: "/pitch-prep", specialistId: "fundraising-advisor" },
  { pattern: "/guild", specialistId: "hiring-team" },
  { pattern: "/retainers", specialistId: "legal-counsel" },
  { pattern: "/provider-portal", specialistId: "sales-lead" },
  { pattern: "/buyer", specialistId: "vp-supply-chain" },
  { pattern: "/orders", specialistId: "vp-supply-chain" },
  { pattern: "/settings", specialistId: "chief-of-staff" },
  { pattern: "/browse", specialistId: "strategist" },
]

export interface RouteSpecialistResult {
  specialistId: SpecialistId
  /** Whether this was the default fallback (no route matched) */
  isDefault: boolean
}

/**
 * Returns the most relevant specialist for a given pathname.
 * Uses exact match first, then longest prefix match, then default.
 *
 * @param pathname - Current route (e.g. "/today", "/team/123")
 * @returns Specialist ID and whether it was the default
 */
export function getSpecialistForRoute(pathname: string): RouteSpecialistResult {
  const normalized = pathname.replace(/\/$/, "") || "/"

  // Exact match
  const exact = ROUTE_SPECIALIST_MAP.find((r) => r.pattern === normalized)
  if (exact) {
    return { specialistId: exact.specialistId, isDefault: false }
  }

  // Prefix match (longest first — sorted by pattern length desc)
  const prefixMatches = ROUTE_SPECIALIST_MAP.filter((r) =>
    normalized.startsWith(r.pattern),
  )
  if (prefixMatches.length > 0) {
    const longest = prefixMatches.reduce((a, b) =>
      a.pattern.length >= b.pattern.length ? a : b,
    )
    return { specialistId: longest.specialistId, isDefault: false }
  }

  return { specialistId: DEFAULT_SPECIALIST, isDefault: true }
}
