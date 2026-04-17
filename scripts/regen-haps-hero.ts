/**
 * One-off: regenerate the HAPS UAV project's system illustration (hero).
 *
 * The project at 3dad9cd7-e4a6-457b-8dff-54a17e598675 was created 2026-04-17 09:49 UTC.
 * Decompose + module images ran; hero never completed (visual_style and
 * system_illustration_url both NULL). Commit 1c45905a fixed the race that would
 * have lost the URL anyway; commit e4bcc0c4 now persists public URLs so this will
 * survive past 1h.
 *
 * Run: npx tsx scripts/regen-haps-hero.ts
 */

import { config } from "dotenv"
config({ path: ".env.local" })
config({ path: ".env" })
import { createClient } from "@supabase/supabase-js"
import { generateResearchIllustration } from "../src/app/(platform)/the-forge/services/image-generator"

const PROJECT_ID = "3dad9cd7-e4a6-457b-8dff-54a17e598675"

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: project, error } = await supabase
    .from("cad_lab_projects")
    .select("subject, modules, visual_style")
    .eq("id", PROJECT_ID)
    .single()

  if (error || !project) {
    throw new Error(`Failed to load project ${PROJECT_ID}: ${error?.message}`)
  }

  const modules = (project.modules ?? []) as Array<{ name: string; purpose: string }>
  const subject = project.subject as string
  const visualStyle = project.visual_style ?? undefined

  console.log(`[regen-hero] Project: ${subject.slice(0, 80)}…`)
  console.log(`[regen-hero] Modules (${modules.length}): ${modules.map(m => m.name).join(", ")}`)
  console.log(`[regen-hero] visualStyle: ${visualStyle ? "present" : "null (will prompt without cohesive style)"}`)
  console.log(`[regen-hero] Calling generateResearchIllustration…`)

  const t0 = Date.now()
  const url = await generateResearchIllustration(
    PROJECT_ID,
    subject,
    modules.map(m => m.name),
    modules.map(m => m.purpose),
    visualStyle as Parameters<typeof generateResearchIllustration>[4],
  )
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[regen-hero] Generated + uploaded in ${elapsed}s: ${url}`)

  const { error: updateErr } = await supabase
    .from("cad_lab_projects")
    .update({ system_illustration_url: url })
    .eq("id", PROJECT_ID)

  if (updateErr) {
    throw new Error(`Failed to persist system_illustration_url: ${updateErr.message}`)
  }

  console.log(`[regen-hero] ✓ system_illustration_url persisted`)
}

main().catch((err) => {
  console.error("[regen-hero] FAILED:", err)
  process.exit(1)
})
