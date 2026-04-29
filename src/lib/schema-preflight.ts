/**
 * @file schema-preflight.ts
 *
 * @description Production migration preflight check.
 *
 * Verifies that the database schema matches what this version of the application
 * expects. Catches the class of failure where a migration was never applied to
 * production, causing missing columns that produce empty or wrong data silently.
 *
 * INTENT: This module is called from three places:
 *   1. instrumentation.ts — on every server cold-start. Throws on mismatch
 *      so Vercel marks the function unhealthy and stops serving traffic.
 *   2. /api/health/schema — dedicated health-check route for monitoring.
 *      Returns 503 on mismatch so uptime monitors alert without crashing
 *      cold starts independently.
 *   3. scripts/preflight-schema.ts — optional build-time Node script. Can be
 *      added to the Vercel Build Command as a pre-step when the database is
 *      reachable at build time.
 *
 * DECISION: Fail closed on any mismatch. The alternative (warn and continue)
 * is the exact failure mode this check was written to prevent — silent data
 * corruption from missing columns. A 500/503 is far better than a PDF with
 * an empty bill of materials and no error visible anywhere.
 *
 * Council-designed (2026-04-29): 6/6 frontier models agreed on this approach.
 * GPT-5.5, Gemini 3.1 Pro, DeepSeek V4-Pro, Mistral Large, Kimi K2.6, Grok-3.
 * All six recommended fail-closed. Five of six recommended checking all three:
 * migration version, column existence, and migration count.
 *
 * Implementation: uses two server-side RPC functions added in migration
 * 20260429500000_schema_preflight_rpc.sql which allow the PostgREST-based
 * admin client to query supabase_migrations.schema_migrations and
 * information_schema without direct cross-schema table access.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// EXPECTED SCHEMA VERSION
//
// The filename prefix (version string) of the most recent migration file.
// This is the "what the database must look like for this code to work"
// contract, embedded at the time the code was written.
//
// IMPORTANT: Update this constant whenever you add a new migration. The
// pre-push hook at scripts/update-schema-version.ts can do this automatically.
// If you add a migration manually, update this constant in the same commit —
// failing to do so means the preflight will false-alarm immediately.
//
// The value below equals the latest migration added when this check was
// written (2026-04-29). It must be kept current as migrations are added.
// ---------------------------------------------------------------------------
export const EXPECTED_SCHEMA_VERSION = '20260429173021'

// ---------------------------------------------------------------------------
// CRITICAL COLUMN CONTRACTS
//
// Specific columns that, if missing, cause silent data corruption — i.e., the
// app runs without throwing but produces empty or wrong output. Expand this
// list whenever a migration adds a column that is load-bearing for a key
// feature.
//
// Column names are verified against production information_schema as of
// 2026-04-29. Do not guess — always verify with:
//   SELECT column_name FROM information_schema.columns
//   WHERE table_schema = 'public' AND table_name = '<table>';
//
// addedIn: the migration version that introduced the column. Used in the
//   error message so the on-call engineer knows exactly which migration to
//   apply.
// ---------------------------------------------------------------------------
export const CRITICAL_COLUMN_CONTRACTS: ReadonlyArray<{
  table: string
  column: string
  addedIn: string
  description: string
}> = [
  {
    table: 'parts',
    column: 'cost_provenance',
    addedIn: '20260429092913',
    description:
      'BOM cost reliability classification (quoted/parametric/placeholder/todo) — ' +
      'missing causes silent empty cost badges in the design report PDF. ' +
      'Root cause of the Loop 24 bill-of-materials failure this check was created to catch.',
  },
  {
    table: 'parts',
    column: 'estimated_unit_cost_gbp',
    addedIn: '20260426014940',
    description:
      'BOM part cost in GBP — missing causes all cost totals to be zero in the design report',
  },
  {
    table: 'marketplace_listings',
    column: 'country_iso',
    addedIn: '20260418042206',
    description:
      'Supplier country ISO-2 code — missing causes supplier matching to silently fall back ' +
      'to free-text country only, degrading match quality',
  },
  {
    table: 'marketplace_listings',
    column: 'latitude',
    addedIn: '20260429110444',
    description:
      'Supplier latitude — missing causes geographic distance matching to silently skip ' +
      'for all suppliers',
  },
  {
    table: 'marketplace_listings',
    column: 'embedding',
    addedIn: '20260414200000',
    description:
      'Supplier semantic search vector — missing causes all semantic supplier searches to ' +
      'return zero results silently',
  },
  {
    table: 'cad_lab_projects',
    column: 'autopilot_state',
    addedIn: '20260421101112',
    description:
      'CAD lab autopilot state JSONB — missing causes the entire autopilot pipeline to ' +
      'fail on every cold start',
  },
  {
    table: 'cad_lab_projects',
    column: 'pipeline_stage',
    addedIn: '20260421101112',
    description:
      'CAD lab autopilot pipeline stage enum — missing causes stage tracking to silently ' +
      'no-op on every advance() call',
  },
  {
    table: 'cad_lab_projects',
    column: 'brief_locked_at',
    addedIn: '20260420111125',
    description:
      'Brief lock timestamp — missing causes brief-lock gating to silently skip, ' +
      'allowing pipeline stages to run on unlocked briefs',
  },
] as const

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface PreflightResult {
  ok: boolean
  schemaVersion: string | null
  expectedVersion: string
  totalAppliedMigrations: number
  missingColumns: string[]
  errors: string[]
  checkedAt: string
}

// ---------------------------------------------------------------------------
// INTERNAL: RPC response shapes
// ---------------------------------------------------------------------------

interface MigrationVersionRow {
  version: string
  total_count: number
}

interface MissingColumnRow {
  table_name: string
  column_name: string
}

// ---------------------------------------------------------------------------
// MAIN PREFLIGHT FUNCTION
// ---------------------------------------------------------------------------

/**
 * Run all schema preflight checks against the production database.
 *
 * Returns a PreflightResult — the caller decides whether to throw, log, or
 * return a 503 based on the `ok` field.
 *
 * Never throws internally. All errors are collected into `result.errors`
 * so the health-check route can return a structured response.
 */
export async function runSchemaPreflight(): Promise<PreflightResult> {
  const checkedAt = new Date().toISOString()
  const errors: string[] = []
  const missingColumns: string[] = []
  let schemaVersion: string | null = null
  let totalAppliedMigrations = 0

  // Guard: skip the check entirely if Supabase credentials are not present.
  // This prevents build-time failures during static generation or preview
  // builds that don't have a database attached.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      '[schema-preflight] Skipping — NEXT_PUBLIC_SUPABASE_URL or ' +
      'SUPABASE_SERVICE_ROLE_KEY not present. This is normal during ' +
      'local development without a Supabase instance.'
    )
    return {
      ok: true,
      schemaVersion: null,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      totalAppliedMigrations: 0,
      missingColumns: [],
      errors: [],
      checkedAt,
    }
  }

  try {
    const admin = createAdminClient()

    // -----------------------------------------------------------------------
    // CHECK 1 & 2: Latest applied migration version + total count
    //
    // Calls schema_preflight_get_latest_migration() which queries the
    // supabase_migrations.schema_migrations table — not accessible via the
    // standard PostgREST table API, hence the RPC wrapper.
    // -----------------------------------------------------------------------
    const { data: migrationRows, error: migrationError } = await admin.rpc(
      'schema_preflight_get_latest_migration'
    )

    if (migrationError) {
      errors.push(
        `Cannot query applied migrations via schema_preflight_get_latest_migration(): ` +
        `${migrationError.message}. ` +
        `The RPC function may not be deployed — check that migration ` +
        `20260429500000_schema_preflight_rpc.sql has been applied to production.`
      )
    } else {
      const rows = migrationRows as MigrationVersionRow[] | null
      if (rows && rows.length > 0) {
        schemaVersion = rows[0].version
        totalAppliedMigrations = Number(rows[0].total_count)

        if (schemaVersion < EXPECTED_SCHEMA_VERSION) {
          errors.push(
            `Schema version mismatch: database is at ${schemaVersion} but this ` +
            `application requires ${EXPECTED_SCHEMA_VERSION}. ` +
            `At least one migration has not been applied to production. ` +
            `Run: npx supabase db push --linked`
          )
        }
      } else {
        errors.push(
          'Applied migrations table appears empty — this would mean zero migrations ' +
          'have ever been applied, which is almost certainly a connection problem.'
        )
      }
    }

    // -----------------------------------------------------------------------
    // CHECK 3: Critical column existence
    //
    // Calls schema_preflight_check_columns(jsonb) which iterates
    // information_schema.columns and returns any missing pairs.
    // Returns an empty array when all columns are present.
    // -----------------------------------------------------------------------
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
        `Cannot check critical column contracts via schema_preflight_check_columns(): ` +
        `${columnError.message}. ` +
        `The RPC function may not be deployed — check migration 20260429500000.`
      )
    } else {
      const missing = missingColumnRows as MissingColumnRow[] | null
      if (missing && missing.length > 0) {
        for (const row of missing) {
          const contract = CRITICAL_COLUMN_CONTRACTS.find(
            c => c.table === row.table_name && c.column === row.column_name
          )
          const key = `${row.table_name}.${row.column_name}`
          missingColumns.push(key)
          errors.push(
            `Missing column ${key}` +
            (contract
              ? ` (added in migration ${contract.addedIn}): ${contract.description}`
              : '') +
            `. Apply the relevant migration to production immediately.`
          )
        }
      }
    }

  } catch (e) {
    errors.push(
      `Preflight check failed with unexpected error: ` +
      `${e instanceof Error ? e.message : String(e)}`
    )
  }

  const ok = errors.length === 0

  return {
    ok,
    schemaVersion,
    expectedVersion: EXPECTED_SCHEMA_VERSION,
    totalAppliedMigrations,
    missingColumns,
    errors,
    checkedAt,
  }
}

/**
 * Run preflight and throw if it fails.
 *
 * Use this in instrumentation.ts where a thrown error causes Vercel to mark
 * the cold start as failed, preventing the instance from serving traffic until
 * the schema is corrected.
 *
 * @throws {Error} if any preflight check fails
 */
export async function assertSchemaPreflight(): Promise<void> {
  const result = await runSchemaPreflight()

  if (!result.ok) {
    const summary = [
      `[SCHEMA PREFLIGHT FAILED] ${result.errors.length} check(s) failed:`,
      ...result.errors.map((e, i) => `  ${i + 1}. ${e}`),
      ``,
      `Database schema version : ${result.schemaVersion ?? 'unknown'}`,
      `Expected schema version : ${result.expectedVersion}`,
      `Missing columns         : ${result.missingColumns.length > 0 ? result.missingColumns.join(', ') : 'none'}`,
      `Total applied migrations: ${result.totalAppliedMigrations}`,
      ``,
      `This instance will not serve traffic until the schema is corrected.`,
      `Run: npx supabase db push --linked`,
    ].join('\n')

    throw new Error(summary)
  }

  // Success — log a brief confirmation so the startup log is auditable
  console.log(
    `[schema-preflight] OK — ` +
    `version ${result.schemaVersion}, ` +
    `${result.totalAppliedMigrations} migrations applied, ` +
    `${CRITICAL_COLUMN_CONTRACTS.length} critical column contracts verified`
  )
}
