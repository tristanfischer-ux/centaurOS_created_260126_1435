/**
 * @file src/lib/plan/route-resolver.ts
 *
 * Canonical-token → URL resolver (PLAN-SCHEMA §14.6).
 *
 * `event_log.cta_href` stores canonical tokens such as `plan:goal:abc-123`.
 * This module resolves a token to a concrete URL at RENDER time, based on
 * the reader's current `new_plan_experience` feature-flag state. Storing
 * the raw path in the DB would lock each CTA to one rendering universe
 * and break rollback safety.
 *
 * Supported tokens:
 *   - `plan:goal:<id>`
 *   - `plan:goal:<id>?modal=pressure-test`
 *   - `plan:goal:<goal_id>?gutcheck=<session_id>`
 *   - `plan:task:<id>`
 *   - `plan:rec:<id>`
 *   - `plan:history:<id>`
 *   - `plan:team:<id>`          (fractional engagement)
 *   - `plan:report:<id>`
 *
 * Unknown tokens return `/today` as a safe fallback so a dangling CTA
 * never 404s the app shell.
 */

export interface PlanFlags {
  newPlanExperience: boolean
}

/**
 * Parses `<section>:<entity_type>:<id_with_optional_query>` into parts.
 * Rejects any input that doesn't begin with `plan:`.
 */
function parsePlanToken(token: string): {
  entityType: string
  id: string
  query: string
} | null {
  if (!token.startsWith('plan:')) return null
  const rest = token.slice('plan:'.length)
  const firstColon = rest.indexOf(':')
  if (firstColon === -1) return null

  const entityType = rest.slice(0, firstColon)
  const tail = rest.slice(firstColon + 1)
  const qIdx = tail.indexOf('?')
  if (qIdx === -1) return { entityType, id: tail, query: '' }
  return {
    entityType,
    id: tail.slice(0, qIdx),
    query: tail.slice(qIdx + 1), // without leading '?'
  }
}

/**
 * Resolves a canonical CTA token to a URL based on the reader's current
 * `new_plan_experience` flag state (PLAN-SCHEMA §14.6).
 *
 *   Flag ON  → /plan/... (new experience)
 *   Flag OFF → legacy routes (e.g. /new-objectives?goal=<id>)
 *
 * If the entity type is unknown, returns `/today` so we never render a
 * 404 into the Today feed.
 */
export function resolvePlanCtaToken(token: string, flags: PlanFlags): string {
  const parsed = parsePlanToken(token)
  if (!parsed) return '/today'

  const { entityType, id, query } = parsed
  const qs = query ? `?${query}` : ''
  const on = flags.newPlanExperience

  switch (entityType) {
    case 'goal': {
      // `?modal=...` and `?gutcheck=...` are already structured query params
      // — they work in both universes because the legacy route also supports
      // ?goal=<id> and respects additional query strings.
      if (on) {
        return `/plan/goal/${id}${qs}`
      }
      // Legacy: collapse extra query params into the goal anchor.
      const extra = query ? `&${query}` : ''
      return `/new-objectives?goal=${id}${extra}`
    }

    case 'task': {
      if (on) return `/plan/task/${id}${qs}`
      return `/new-tasks?task=${id}${query ? `&${query}` : ''}`
    }

    case 'rec': {
      if (on) return `/plan/rec/${id}${qs}`
      // No dedicated legacy rec page — fall back to Forge insights inbox.
      return `/today?rec=${id}`
    }

    case 'history': {
      if (on) return `/plan/history/${id}${qs}`
      return `/plan/history/${id}${qs}` // No legacy history route; keep new.
    }

    case 'team': {
      if (on) return `/plan/team/${id}${qs}`
      return `/the-team?fractional=${id}${query ? `&${query}` : ''}`
    }

    case 'report': {
      if (on) return `/plan/report/${id}${qs}`
      return `/plan/report/${id}${qs}` // No legacy report page; keep new.
    }

    default:
      return '/today'
  }
}
