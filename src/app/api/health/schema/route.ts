/**
 * @file /api/health/schema — schema migration preflight health-check endpoint.
 *
 * @description Returns the result of the database schema preflight check in
 * JSON. Returns 200 when all checks pass, 503 when any check fails.
 *
 * INTENT: This endpoint exists for three purposes:
 *   1. Uptime monitors (e.g. BetterUptime, UptimeRobot) can probe this route
 *      and alert immediately if a migration drift is detected.
 *   2. Ops can call it manually after a deployment to confirm the schema is
 *      current before declaring the deploy healthy.
 *   3. Load-balancer health checks can use it to pull traffic away from
 *      instances where the schema has drifted.
 *
 * SECURITY: Returns minimal detail in the response body. Full error text is
 * logged server-side but not exposed to callers — the endpoint is not
 * authenticated and could be called by anyone.
 *
 * Note: this route does NOT throw on a failed preflight (unlike
 * instrumentation.ts). It returns 503 with a JSON body so the calling
 * monitoring system gets a structured response rather than a crash.
 */

import { NextResponse } from 'next/server'
import { runSchemaPreflight } from '@/lib/schema-preflight'

export const dynamic = 'force-dynamic'

// Cache for 30 seconds — the check involves two DB round-trips and does not
// need to run on every request. Monitoring probes at 30-60s intervals fit
// within this window.
export const revalidate = 30

export async function GET() {
  const startTime = Date.now()

  try {
    const result = await runSchemaPreflight()
    const responseTime = Date.now() - startTime

    if (!result.ok) {
      // Log full detail server-side for Vercel logs / Sentry
      console.error(
        '[schema-health] FAIL',
        JSON.stringify({
          schemaVersion: result.schemaVersion,
          expectedVersion: result.expectedVersion,
          totalAppliedMigrations: result.totalAppliedMigrations,
          missingColumns: result.missingColumns,
          errors: result.errors,
        })
      )

      // Return 503 with summary — not full error text for security
      return NextResponse.json(
        {
          status: 'schema_mismatch',
          schemaVersion: result.schemaVersion,
          expectedVersion: result.expectedVersion,
          missingColumnCount: result.missingColumns.length,
          errorCount: result.errors.length,
          checkedAt: result.checkedAt,
          responseTime: `${responseTime}ms`,
          action: 'Run: npx supabase db push --linked',
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        status: 'ok',
        schemaVersion: result.schemaVersion,
        expectedVersion: result.expectedVersion,
        totalAppliedMigrations: result.totalAppliedMigrations,
        criticalColumnsVerified: result.missingColumns.length === 0,
        checkedAt: result.checkedAt,
        responseTime: `${responseTime}ms`,
      },
      { status: 200 }
    )
  } catch (e) {
    const responseTime = Date.now() - startTime

    // Unexpected error — log it, return 503
    console.error('[schema-health] Unexpected error during preflight:', e)

    return NextResponse.json(
      {
        status: 'error',
        message: 'Schema preflight check encountered an unexpected error. Check server logs.',
        responseTime: `${responseTime}ms`,
      },
      { status: 503 }
    )
  }
}
