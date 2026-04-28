import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from '@/types/database.types'
import { FLAG_NEW_PLAN_EXPERIENCE } from '@/lib/features/keys'

/**
 * @file src/lib/plan/legacy-redirects.ts
 *
 * PLAN-SCHEMA §A.3 legacy-route redirects for the Plan section.
 *
 * Invoked from the root middleware.ts on every request. Fast-fails (returns
 * `null` without any DB work) unless the request path starts with one of
 * the 9 legacy Plan routes. Only then does it read the caller's
 * `profiles.feature_flags.new_plan_experience` to decide whether to fire
 * a 301.
 *
 *   Flag ON  → issue 301 to the canonical /plan/* destination
 *   Flag OFF → return null; legacy page continues to render
 *   Anon     → return null; auth middleware will redirect to /login
 *
 * Notes:
 *   - We instantiate a lean Supabase server client here rather than
 *     reusing the one built in updateSession() because updateSession
 *     runs AFTER this helper. Duplicating the cookie bridge is the cost
 *     of short-circuiting legacy traffic without touching auth flow.
 *   - Cache: each middleware invocation builds its own client; there's
 *     no cross-request cache. That's OK — the `profiles` SELECT is a
 *     single-row PK lookup and only runs on legacy Plan paths.
 *   - All redirects use 301 (permanent) per PLAN-SCHEMA §A.3.
 */

interface RedirectSpec {
    /** Exact pathname OR prefix (when `prefix: true`). */
    match: string
    prefix?: boolean
    /** Builds the target URL; `url` is the incoming request URL. */
    build: (url: URL) => URL
}

function to(pathname: string, search?: string): (url: URL) => URL {
    return (url) => {
        const out = new URL(url.toString())
        out.pathname = pathname
        out.search = search ?? ''
        return out
    }
}

/**
 * Copy a specific query param from the source URL to a new search string.
 * Used for `/reports/[id]` → `/plan/report/[id]` style rewrites that
 * preserve `?id=<value>`.
 */
function preserveParam(
    url: URL,
    srcKey: string,
    destKey: string,
    extra?: Record<string, string>,
): string {
    const params = new URLSearchParams()
    const v = url.searchParams.get(srcKey)
    if (v) params.set(destKey, v)
    if (extra) for (const [k, val] of Object.entries(extra)) params.set(k, val)
    const s = params.toString()
    return s ? `?${s}` : ''
}

const REDIRECTS: RedirectSpec[] = [
    // /strategy → /plan
    { match: '/strategy', prefix: true, build: (url) => to('/plan')(url) },

    // /new-objectives (+ /new-objectives/[id]) → /plan; preserve ?goal=
    {
        match: '/new-objectives',
        prefix: true,
        build: (url) => {
            const goal = url.searchParams.get('goal')
            const out = new URL(url.toString())
            out.pathname = '/plan'
            out.search = goal ? `?goal=${encodeURIComponent(goal)}` : ''
            return out
        },
    },

    // /objectives and /objectives/[id] → /plan
    {
        match: '/objectives',
        prefix: true,
        build: (url) => {
            // Capture /objectives/<id> → /plan?goal=<id>
            const segs = url.pathname.split('/').filter(Boolean)
            const idFromPath = segs[1] && segs[1] !== '' ? segs[1] : null
            const goal = idFromPath ?? url.searchParams.get('goal')
            const out = new URL(url.toString())
            out.pathname = '/plan'
            out.search = goal ? `?goal=${encodeURIComponent(goal)}` : ''
            return out
        },
    },

    // /new-tasks → /plan; preserve ?task= as task drawer param
    {
        match: '/new-tasks',
        prefix: true,
        build: (url) => {
            const task = url.searchParams.get('task')
            const out = new URL(url.toString())
            out.pathname = '/plan'
            out.search = task ? `?task=${encodeURIComponent(task)}` : ''
            return out
        },
    },

    // /tasks and /tasks/[id] → /plan; path-id lifts to ?task=
    {
        match: '/tasks',
        prefix: true,
        build: (url) => {
            const segs = url.pathname.split('/').filter(Boolean)
            const idFromPath = segs[1] && segs[1] !== '' ? segs[1] : null
            const task = idFromPath ?? url.searchParams.get('task')
            const out = new URL(url.toString())
            out.pathname = '/plan'
            out.search = task ? `?task=${encodeURIComponent(task)}` : ''
            return out
        },
    },

    // /review and /review/preview/[id] → /plan?tab=waiting
    { match: '/review', prefix: true, build: to('/plan', '?tab=waiting') },

    // /reports and /reports/[id] → /plan/report (preserve ?id= OR path id)
    {
        match: '/reports',
        prefix: true,
        build: (url) => {
            const segs = url.pathname.split('/').filter(Boolean)
            const idFromPath = segs[1] && segs[1] !== '' ? segs[1] : null
            const id = idFromPath ?? url.searchParams.get('id')
            const out = new URL(url.toString())
            out.pathname = id ? `/plan/report/${id}` : '/plan/report'
            out.search = ''
            return out
        },
    },

    // /red-team and /red-team/[id] → /plan with pressure-test modal param
    {
        match: '/red-team',
        prefix: true,
        build: (url) => {
            const segs = url.pathname.split('/').filter(Boolean)
            const idFromPath = segs[1] && segs[1] !== '' ? segs[1] : null
            const params = new URLSearchParams()
            params.set('modal', 'pressure-test')
            if (idFromPath) params.set('session', idFromPath)
            const out = new URL(url.toString())
            out.pathname = '/plan'
            out.search = `?${params.toString()}`
            return out
        },
    },

    // /knowledge and /knowledge/[id] → /plan/history
    {
        match: '/knowledge',
        prefix: true,
        build: (url) => {
            const segs = url.pathname.split('/').filter(Boolean)
            const idFromPath = segs[1] && segs[1] !== '' ? segs[1] : null
            // Avoid double-preserve:
            void preserveParam
            const out = new URL(url.toString())
            if (idFromPath) {
                out.pathname = `/plan/history/${idFromPath}`
                out.search = '?source=knowledge'
            } else {
                out.pathname = '/plan/history'
                out.search = '?source=knowledge'
            }
            return out
        },
    },
]

/**
 * Returns true if `pathname` is `match` OR a child thereof (for prefix
 * specs). We're careful to require a `/` boundary so `/strategy-board`
 * does NOT match `/strategy`.
 */
function pathMatches(pathname: string, spec: RedirectSpec): boolean {
    if (!spec.prefix) return pathname === spec.match
    if (pathname === spec.match) return true
    return pathname.startsWith(spec.match + '/')
}

function findSpec(pathname: string): RedirectSpec | null {
    for (const s of REDIRECTS) {
        if (pathMatches(pathname, s)) return s
    }
    return null
}

/**
 * Read `profiles.feature_flags.new_plan_experience` for the caller. Returns
 * false for anonymous users, on DB error, or when the flag is absent.
 *
 * This helper builds its own lean Supabase server client (request-scoped
 * cookie bridge) to avoid double-booting the full session machinery from
 * lib/supabase/middleware.ts.
 */
async function readNewPlanFlag(request: NextRequest): Promise<boolean> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return false

    // Minimal cookie bridge: reads only, we don't need to propagate cookie
    // writes here because updateSession() will run next and do the refresh.
    const supabase = createServerClient<Database>(url, key, {
        cookies: {
            getAll() {
                return request.cookies.getAll()
            },
            setAll() {
                /* noop — updateSession handles session refresh */
            },
        },
    })

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
        .from('profiles')
        .select('feature_flags')
        .eq('id', user.id)
        .maybeSingle()

    if (error || !data) return false
    const flags = (data.feature_flags ?? {}) as Record<string, unknown>
    return flags[FLAG_NEW_PLAN_EXPERIENCE] === true
}

/**
 * Main entry — returns a redirect response when the path is a legacy Plan
 * route AND the caller has `new_plan_experience` ON. Returns `null`
 * otherwise so the caller can fall through to updateSession.
 */
export async function maybeRedirectLegacyPlan(
    request: NextRequest,
): Promise<NextResponse | null> {
    const pathname = request.nextUrl.pathname

    // Fast-fail: if the path isn't a legacy Plan route, do zero DB work.
    const spec = findSpec(pathname)
    if (!spec) return null

    const flagOn = await readNewPlanFlag(request)
    if (!flagOn) return null

    const target = spec.build(request.nextUrl)
    return NextResponse.redirect(target, 301)
}
