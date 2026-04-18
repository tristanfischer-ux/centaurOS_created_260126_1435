/**
 * @file _shared.ts — Shared helpers for supplier-enrichment scripts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function parseArgs(argv: string[]): { dryRun: boolean; limit: number | null } {
  const args = argv.slice(2)
  return {
    dryRun: args.includes("--dry-run"),
    limit: (() => {
      const i = args.indexOf("--limit")
      if (i === -1) return null
      const n = parseInt(args[i + 1], 10)
      return Number.isNaN(n) ? null : n
    })(),
  }
}

export function appendEnrichmentSource(
  existing: unknown,
  source: string,
  fields: string[],
): Array<Record<string, unknown>> {
  const arr = Array.isArray(existing) ? (existing as Array<Record<string, unknown>>) : []
  return [
    ...arr,
    { source, run_at: new Date().toISOString(), fields },
  ].slice(-50) // keep last 50 entries
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function log(...args: unknown[]): void {
  const stamp = new Date().toISOString().replace(/[TZ]/g, " ").slice(0, 19)
  // eslint-disable-next-line no-console
  console.log(`[${stamp}]`, ...args)
}
