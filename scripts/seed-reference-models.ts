/**
 * @file seed-reference-models.ts
 *
 * @description Reference models are seeded via SQL migration
 * (supabase/migrations/20260218170001_seed_reference_models.sql).
 * This script can be used to verify the seed or to upload STL/STEP files
 * to storage and update reference_models.stl_url / step_url.
 *
 * Run: npx tsx scripts/seed-reference-models.ts
 */

import { createClient } from "@supabase/supabase-js"

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.log("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) to verify seed.")
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from("reference_models")
    .select("id, category, name, stl_url, step_url, sort_order")
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("Failed to list reference_models:", error.message)
    process.exit(1)
  }

  console.log(`reference_models: ${data?.length ?? 0} rows`)
  data?.forEach((row) => {
    console.log(`  - ${row.category}: ${row.name} (stl: ${row.stl_url ? "yes" : "no"}, step: ${row.step_url ? "yes" : "no"})`)
  })
}

main()
