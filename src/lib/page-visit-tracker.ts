/**
 * @file page-visit-tracker.ts
 *
 * @description Tracks which pages the user has visited using localStorage.
 * Used by the specialist guidance system to detect first-visit pages
 * and proactively offer orientation.
 *
 * @related
 * - Screen context: src/contexts/screen-context.tsx
 * - Page knowledge: src/lib/page-knowledge.ts
 * - BriefSpecialistDialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 */

const STORAGE_PREFIX = "forgeos:page-visit:"

/**
 * Checks whether this is the user's first visit to a page.
 *
 * @param route - Normalized route path (e.g. "/strategy")
 * @returns true if the user has never visited this route
 */
export function isFirstPageVisit(route: string): boolean {
  try {
    const key = `${STORAGE_PREFIX}${normalizeRoute(route)}`
    return localStorage.getItem(key) === null
  } catch {
    // localStorage unavailable (SSR, private browsing, etc.)
    return false
  }
}

/**
 * Marks a page as visited. Call after the page has rendered.
 *
 * @param route - Normalized route path (e.g. "/strategy")
 */
export function markPageVisited(route: string): void {
  try {
    const key = `${STORAGE_PREFIX}${normalizeRoute(route)}`
    const existing = localStorage.getItem(key)
    const count = existing ? parseInt(existing, 10) : 0
    localStorage.setItem(key, String(count + 1))
  } catch {
    // localStorage unavailable
  }
}

/**
 * Returns how many times the user has visited a page.
 *
 * @param route - Normalized route path (e.g. "/strategy")
 * @returns Visit count (0 if never visited)
 */
export function getPageVisitCount(route: string): number {
  try {
    const key = `${STORAGE_PREFIX}${normalizeRoute(route)}`
    const value = localStorage.getItem(key)
    return value ? parseInt(value, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Normalizes a route for consistent storage keys.
 * Strips trailing slashes and dynamic segments (UUIDs).
 *
 * @example
 * normalizeRoute("/strategy/") -> "/strategy"
 * normalizeRoute("/strategic-planner/abc-123") -> "/strategic-planner"
 */
function normalizeRoute(route: string): string {
  // Strip trailing slash
  let normalized = route.replace(/\/$/, "") || "/"

  // Strip UUID-like dynamic segments to group sub-pages under parent
  // e.g. /strategic-planner/550e8400-e29b... -> /strategic-planner
  normalized = normalized.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "",
  )

  return normalized
}
