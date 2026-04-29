/**
 * @file scripts/preflight-schema.ts
 *
 * @description Standalone build-time schema migration preflight check.
 *
 * This script can be run before `next build` to catch unapplied migrations
 * before a deployment is promoted to production. It uses the same logic as
 * the runtime preflight in src/lib/schema-preflight.ts.
 *
 * USAGE:
 *   npx tsx scripts/preflight-schema.ts
 *
 * Add to Vercel Build Command when the database is reachable at build time:
 *   npx tsx scripts/preflight-schema.ts && next build
 *
 * Note: On the Vercel Pro plan, the build container does NOT have direct
 * database access by default — the Supabase URL and service-role key must be
 * present as Vercel environment variables for this script to connect. If they
 * are not present, the script exits cleanly with code 0 (skip, don't block
 * the build) and logs a warning. The primary protection is the runtime check
 * in instrumentation.ts which runs on every cold start.
 *
 * INTENT: Belt-and-braces. The runtime check is the primary gate. This script
 * is the earlier gate that catches drift before any traffic reaches the new
 * deployment. Running both means schema drift is caught at deploy time AND at
 * cold-start time.
 */

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Inline the preflight logic here rather than importing from src/ so this
// script can run without the full Next.js module resolution environment.
// ---------------------------------------------------------------------------

const EXPECTED_SCHEMA_VERSION = '20260429173021'

const CRITICAL_COLUMN_CONTRACTS = [
  { table: 'parts', column: 'cost_provenance', addedIn: '20260429092913' },
  { table: 'parts', column: 'estimated_unit_cost_gbp', addedIn: '20260426014940' },
  { table: 'marketplace_listings', column: 'country_iso', addedIn: '20260418042206' },
  { table: 'marketplace_listings', column: 'latitude', addedIn: '20260429110444' },
  { table: 'marketplace_listings', column: 'embedding', addedIn: '20260414200000' },
  { table: 'cad_lab_projects', column: 'autopilot_state', addedIn: '20260421101112' },
  { table: 'cad_lab_projects', column: 'pipeline_stage', addedIn: '20260421101112' },
  { table: 'cad_lab_projects', column: 'brief_locked_at', addedIn: '20260420111125' },
] as const

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.warn(
      '[preflight-schema] SKIP — NEXT_PUBLIC_SUPABASE_URL or ' +
      'SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Cannot connect to the database from the build container. ' +
      'The runtime preflight check in instrumentation.ts will catch ' +
      'schema drift when the application starts.'
    )
    process.exit(0)
  }

  console.log('[preflight-schema] Connecting to Supabase...')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const errors: string[] = []

  // -------------------------------------------------------------------------
  // CHECK 1: Latest applied migration version
  // -------------------------------------------------------------------------
  const { data: migrationRows, error: migrationError } = await admin.rpc(
    'schema_preflight_get_latest_migration'
  )

  if (migrationError) {
    errors.push(
      `Cannot query applied migrations: ${migrationError.message}. ` +
      `Is migration 20260429500000_schema_preflight_rpc.sql applied?`
    )
  } else {
    const rows = migrationRows as Array<{ version: string; total_count: number }> | null
    if (rows && rows.length > 0) {
      const { version: schemaVersion, total_count } = rows[0]
      console.log(
        `[preflight-schema] Database version: ${schemaVersion}, ` +
        `${total_count} migrations applied`
      )

      if (schemaVersion < EXPECTED_SCHEMA_VERSION) {
        errors.push(
          `Schema version mismatch: database is at ${schemaVersion}, ` +
          `application requires ${EXPECTED_SCHEMA_VERSION}. ` +
          `Run: npx supabase db push --linked`
        )
      } else {
        console.log(`[preflight-schema] Schema version OK (${schemaVersion})`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // CHECK 2: Critical column existence
  // -------------------------------------------------------------------------
  const columnChecks = CRITICAL_COLUMN_CONTRACTS.map(c => ({
    table_name: c.table,
    column_name: c.column,
  }))

  const { data: missingColumnRows, error: columnError } = await admin.rpc(
    'schema_preflight_check_columns',
    { checks: columnChecks }
  )

  if (columnError) {
    errors.push(
      `Cannot check critical column contracts: ${columnError.message}. ` +
      `Is migration 20260429500000_schema_preflight_rpc.sql applied?`
    )
  } else {
    const missing = missingColumnRows as Array<{ table_name: string; column_name: string }> | null
    if (missing && missing.length > 0) {
      for (const row of missing) {
        const contract = CRITICAL_COLUMN_CONTRACTS.find(
          c => c.table === row.table_name && c.column === row.column_name
        )
        errors.push(
          `Missing column ${row.table_name}.${row.column_name}` +
          (contract ? ` (added in migration ${contract.addedIn})` : '') +
          `. Apply the relevant migration to production.`
        )
      }
    } else {
      console.log(
        `[preflight-schema] All ${CRITICAL_COLUMN_CONTRACTS.length} ` +
        `critical column contracts verified OK`
      )
    }
  }

  // -------------------------------------------------------------------------
  // Result
  // -------------------------------------------------------------------------
  if (errors.length > 0) {
    console.error('\n[preflight-schema] FAILED — schema is out of date:\n')
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`))
    console.error('\nFix: npx supabase db push --linked\n')
    process.exit(1)
  }

  console.log('[preflight-schema] All checks passed. Schema is current.\n')
  process.exit(0)
}

main().catch(e => {
  console.error('[preflight-schema] Unexpected error:', e)
  process.exit(1)
})
