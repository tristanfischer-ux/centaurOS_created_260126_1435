/**
 * @file backfill-manufacturing-technique-embeddings.ts
 *
 * @description One-time backfill: embed all existing rows in
 * `process_capabilities` and `manufacturing_technique_enrichments` using
 * nomic-embed-text-v1.5 (768 dims). Matches the embedding model used by
 * marketplace_listings so cross-table similarity is comparable.
 *
 * Usage: npx tsx scripts/backfill-manufacturing-technique-embeddings.ts
 *
 * Requires: NOMIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Safe to re-run — only embeds rows where embedding IS NULL.
 */

import { createClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const NOMIC_API_URL = "https://api-atlas.nomic.ai/v1/embedding/text"
const NOMIC_MODEL = "nomic-embed-text-v1.5"
const NOMIC_DIMS = 768
const BATCH_SIZE = 10
const DELAY_MS = 300

function loadEnvLocal() {
  try {
    const envPath = join(process.cwd(), ".env.local")
    const raw = readFileSync(envPath, "utf-8")
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env.local not present — rely on existing env
  }
}

async function nomicEmbedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(NOMIC_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NOMIC_MODEL,
      texts,
      task_type: "search_document",
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Nomic API ${res.status}: ${detail.slice(0, 400)}`)
  }
  const data = (await res.json()) as { embeddings: number[][] }
  if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
    throw new Error(`Nomic returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`)
  }
  for (const e of data.embeddings) {
    if (!Array.isArray(e) || e.length !== NOMIC_DIMS) {
      throw new Error(`Nomic returned ${e?.length ?? 0}-dim embedding, expected ${NOMIC_DIMS}`)
    }
  }
  return data.embeddings
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32)
}

/** Text to embed for a process_capabilities row. */
function textForProcessCapability(r: Record<string, unknown>): string {
  const parts = [
    r.display_name as string | null ?? r.process_name as string,
    `Process: ${r.process_name as string}`,
    r.tolerance_typical_mm != null ? `Typical tolerance: ${r.tolerance_typical_mm}mm` : "",
    r.tolerance_min_mm != null && r.tolerance_max_mm != null
      ? `Range: ${r.tolerance_min_mm}mm to ${r.tolerance_max_mm}mm`
      : "",
    Array.isArray(r.suitable_materials) && r.suitable_materials.length > 0
      ? `Materials: ${(r.suitable_materials as string[]).join(", ")}`
      : "",
    Array.isArray(r.unsuitable_materials) && r.unsuitable_materials.length > 0
      ? `Avoid: ${(r.unsuitable_materials as string[]).join(", ")}`
      : "",
    r.typical_lead_time_days != null ? `Lead time ~${r.typical_lead_time_days} days` : "",
  ]
  return parts.filter(Boolean).join(". ")
}

/** Text to embed for a manufacturing_technique_enrichments row. */
function textForEnrichment(r: Record<string, unknown>): string {
  const parts = [
    r.technique_slug as string,
    r.article_markdown as string | null ?? "",
  ]
  const jsonFields = ["real_world_tolerances", "real_world_materials", "real_world_equipment", "tips_and_insights", "common_applications"]
  for (const key of jsonFields) {
    const v = r[key]
    if (v && typeof v === "object") {
      parts.push(`${key.replace(/_/g, " ")}: ${JSON.stringify(v).slice(0, 400)}`)
    }
  }
  return parts.filter(Boolean).join(". ").slice(0, 6000)
}

async function backfillTable(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  table: "process_capabilities" | "manufacturing_technique_enrichments",
  idField: "id",
  selectFields: string,
  textFn: (r: Record<string, unknown>) => string,
) {
  console.log(`\n── ${table} ──`)
  const { data: rows, error } = await supabase
    .from(table)
    .select(`${idField}, ${selectFields}, embedding, content_hash`)
    .order(idField)

  if (error || !rows) {
    console.error(`  fetch failed: ${error?.message}`)
    return { processed: 0, failed: 0 }
  }

  const needsEmbed = rows.filter((r: Record<string, unknown>) => r.embedding == null)
  console.log(`  ${rows.length} rows total, ${needsEmbed.length} need embedding`)

  let processed = 0
  let failed = 0

  for (let offset = 0; offset < needsEmbed.length; offset += BATCH_SIZE) {
    const batch = needsEmbed.slice(offset, offset + BATCH_SIZE)
    const texts = batch.map(textFn)
    const hashes = texts.map(hashContent)

    try {
      const embeddings = await nomicEmbedBatch(texts, apiKey)

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i]
        const embStr = `[${embeddings[i].join(",")}]`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateErr } = await supabase
          .from(table)
          .update({
            embedding: embStr,
            content_hash: hashes[i],
            embedded_at: new Date().toISOString(),
          } as any)
          .eq(idField, (row as Record<string, unknown>)[idField] as string)

        if (updateErr) {
          console.warn(`  ✗ ${row[idField as keyof typeof row]} update failed: ${updateErr.message?.slice(0, 80)}`)
          failed++
        } else {
          processed++
        }
      }

      const pct = Math.round(((offset + batch.length) / needsEmbed.length) * 100)
      console.log(`  ${offset + batch.length}/${needsEmbed.length} (${pct}%) — ${processed} embedded, ${failed} failed`)
    } catch (err) {
      console.warn(`  batch failed: ${err instanceof Error ? err.message : err}`)
      failed += batch.length
    }

    if (offset + BATCH_SIZE < needsEmbed.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  return { processed, failed }
}

async function main() {
  loadEnvLocal()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const nomicKey = process.env.NOMIC_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  if (!nomicKey) {
    console.error("Missing NOMIC_API_KEY")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const r1 = await backfillTable(
    supabase,
    nomicKey,
    "process_capabilities",
    "id",
    "process_name, display_name, tolerance_min_mm, tolerance_typical_mm, tolerance_max_mm, suitable_materials, unsuitable_materials, typical_lead_time_days",
    textForProcessCapability,
  )

  const r2 = await backfillTable(
    supabase,
    nomicKey,
    "manufacturing_technique_enrichments",
    "id",
    "technique_slug, article_markdown, real_world_tolerances, real_world_materials, real_world_equipment, tips_and_insights, common_applications",
    textForEnrichment,
  )

  console.log(
    `\nDone. process_capabilities: ${r1.processed} embedded / ${r1.failed} failed. manufacturing_technique_enrichments: ${r2.processed} embedded / ${r2.failed} failed.`,
  )
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
