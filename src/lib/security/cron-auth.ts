/**
 * @file cron-auth.ts — Shared cron job authentication utility.
 *
 * @description Verifies the CRON_SECRET Bearer token on incoming cron requests.
 * Extracted from 6 cron route files that each had identical inline copies:
 *   - src/app/api/cron/agent-sweep/route.ts
 *   - src/app/api/cron/specialist-briefings/route.ts
 *   - src/app/api/cron/weekly-synthesis/route.ts
 *   - src/app/api/cron/telegram-briefings/route.ts
 *   - src/app/api/cron/reports/daily/route.ts
 *   - src/app/api/cron/morning-brief/route.ts
 *
 * @audit Extracted 2026-02-19 as part of specialist system maintainability refactor (Step 1 of 8).
 *        No logic changes — the function body is identical to the originals.
 *
 * @security This is the sole gatekeeper for all Vercel cron jobs. Fail-closed:
 *           returns 503 when CRON_SECRET is not configured, 401 when the token
 *           doesn't match. Returns null when authentication succeeds.
 */

import { NextResponse } from "next/server"

/**
 * Verifies the CRON_SECRET Bearer token on a cron job request.
 *
 * @param req - Incoming request (accepts both Request and NextRequest since
 *              NextRequest extends Request and we only read headers)
 * @returns A NextResponse with an error status if auth fails, or null if auth succeeds.
 *
 * @security Fail-closed in all environments when CRON_SECRET is missing.
 *           The caller should return the response immediately when non-null:
 *           ```
 *           const authFailure = verifyCronSecret(req)
 *           if (authFailure) return authFailure
 *           ```
 */
export function verifyCronSecret(req: Request): NextResponse | null {
    const cronSecret = process.env.CRON_SECRET

    // SECURITY: Fail closed when cron secret is not configured.
    if (!cronSecret) {
        console.error("[SECURITY] CRON_SECRET not configured")
        return NextResponse.json(
            { error: "Cron secret not configured" },
            { status: 503 },
        )
    }

    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return null
}
