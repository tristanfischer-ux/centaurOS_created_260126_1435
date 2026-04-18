/**
 * @file seed-manufacturing-techniques.ts
 *
 * @description LLM-seeds the manufacturing_technique_enrichments table with
 * ~80 additional techniques beyond the curated 27 that exist. Writes rows
 * with `reviewed=false` so the match_manufacturing_techniques RPC hides them
 * from production UI by default (only_reviewed=true). Each row is
 * immediately embedded so it's queryable once a human sets reviewed=true.
 *
 * Usage: npx tsx scripts/seed-manufacturing-techniques.ts [--count=N] [--dry-run]
 *
 * Requires: DEEPSEEK_API_KEY, NOMIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY.
 *
 * Safe to re-run — skips any slug that already exists in the table.
 */

import { createClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
const NOMIC_URL = "https://api-atlas.nomic.ai/v1/embedding/text"
const NOMIC_MODEL = "nomic-embed-text-v1.5"
const NOMIC_DIMS = 768

// Target taxonomy. Each entry is a seed slug the LLM will expand into a full
// technique row. Covers process families missing or thin in the curated 27.
const SEED_TAXONOMY: string[] = [
  // CNC variants
  "5-axis-cnc-milling", "swiss-cnc-turning", "cnc-routing", "cnc-engraving",
  "cnc-grinding", "cnc-honing",
  // Additive — beyond fdm/sla/sls/dmls
  "multi-jet-fusion", "polyjet", "binder-jetting-metal", "binder-jetting-sand",
  "electron-beam-melting", "directed-energy-deposition", "material-extrusion-composite",
  "vat-photopolymerisation-dlp", "cold-spray-additive",
  // Sheet metal
  "sheet-metal-stamping", "sheet-metal-deep-drawing", "sheet-metal-hydroforming",
  "sheet-metal-spinning", "sheet-metal-progressive-die", "sheet-metal-roll-forming",
  "sheet-metal-fine-blanking",
  // Composites
  "hand-layup", "vacuum-bag-layup", "resin-transfer-moulding", "filament-winding",
  "pultrusion", "automated-fibre-placement", "prepreg-autoclave", "compression-moulding-composite",
  "braiding-composite",
  // Injection & plastics
  "gas-assisted-injection", "insert-moulding", "over-moulding", "micro-injection-moulding",
  "blow-moulding", "rotational-moulding", "thermoforming", "extrusion-plastic",
  // Casting
  "lost-foam-casting", "gravity-die-casting", "centrifugal-casting", "shell-moulding",
  "ceramic-mould-casting", "continuous-casting",
  // EDM
  "sinker-edm", "fast-hole-edm", "edm-drilling",
  // Welding / joining
  "laser-beam-welding", "electron-beam-welding", "friction-stir-welding", "resistance-spot-welding",
  "ultrasonic-welding-metal", "ultrasonic-welding-plastic", "brazing", "soldering",
  "adhesive-bonding-structural", "riveting", "self-piercing-riveting", "clinching",
  // Forming
  "cold-forging", "hot-forging", "upset-forging", "impact-extrusion", "hydrostatic-extrusion",
  "superplastic-forming", "incremental-sheet-forming",
  // Surface finishing / coating
  "electropolishing", "chemical-polishing", "anodising", "hard-anodising", "electroplating",
  "electroless-plating", "powder-coating", "plasma-spray-coating", "hvof-coating",
  "parylene-conformal-coating", "passivation", "chromate-conversion",
  // Heat treat
  "solution-heat-treatment", "aging-precipitation-hardening", "case-hardening",
  "nitriding", "carburising", "induction-hardening",
  // Inspection / metrology
  "cmm-inspection", "laser-scanning-metrology", "x-ray-ct-inspection", "ultrasonic-inspection",
  "dye-penetrant-inspection", "magnetic-particle-inspection",
  // Emerging
  "hybrid-additive-subtractive", "large-format-additive", "wire-arc-additive",
]

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
    /* noop */
  }
}

interface TechniqueRow {
  technique_slug: string
  article_markdown: string
  real_world_tolerances: Record<string, unknown>
  real_world_materials: string[]
  real_world_equipment: string[]
  tips_and_insights: string[]
  common_applications: string[]
}

const PROMPT_SYSTEM = `You are an engineering manufacturing reference writer. Given a technique slug, generate a factual, factory-realistic reference entry for use in a Design-for-Manufacture tool for hardware founders. Never invent brand names. Keep values in SI units. Avoid superlatives.

Return ONLY valid JSON (no markdown fences) with this exact schema:
{
  "technique_slug": "string (echo input slug, hyphenated)",
  "article_markdown": "2-4 short paragraphs, markdown allowed. Cover: what it is, when to choose it, key tradeoffs, typical part size range, surface finish, tolerance band. Max 1400 chars.",
  "real_world_tolerances": {"typical_mm": 0.1, "best_mm": 0.05, "worst_mm": 0.5, "notes": "..."},
  "real_world_materials": ["list","of","materials","commonly","processed"],
  "real_world_equipment": ["named classes of equipment, not brands"],
  "tips_and_insights": ["5–8 practical tips a factory would ask or warn about"],
  "common_applications": ["3–6 example applications"]
}`

async function generateTechnique(slug: string, apiKey: string): Promise<TechniqueRow | null> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: "system", content: PROMPT_SYSTEM },
        { role: "user", content: `Technique: ${slug}` },
      ],
    }),
  })
  if (!res.ok) {
    console.warn(`  ✗ ${slug} LLM HTTP ${res.status}`)
    return null
  }
  const data = await res.json()
  const text = (data.choices?.[0]?.message?.content ?? "").trim()
  if (!text) return null

  const jsonStr = text.startsWith("{") ? text : text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim()
  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed.technique_slug || !parsed.article_markdown) return null
    return {
      technique_slug: String(parsed.technique_slug).toLowerCase().replace(/\s+/g, "-"),
      article_markdown: String(parsed.article_markdown).slice(0, 8000),
      real_world_tolerances:
        parsed.real_world_tolerances && typeof parsed.real_world_tolerances === "object"
          ? parsed.real_world_tolerances
          : {},
      real_world_materials: Array.isArray(parsed.real_world_materials)
        ? parsed.real_world_materials.map(String).slice(0, 20)
        : [],
      real_world_equipment: Array.isArray(parsed.real_world_equipment)
        ? parsed.real_world_equipment.map(String).slice(0, 20)
        : [],
      tips_and_insights: Array.isArray(parsed.tips_and_insights)
        ? parsed.tips_and_insights.map(String).slice(0, 12)
        : [],
      common_applications: Array.isArray(parsed.common_applications)
        ? parsed.common_applications.map(String).slice(0, 10)
        : [],
    }
  } catch (err) {
    console.warn(`  ✗ ${slug} JSON parse failed: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function nomicEmbedOne(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(NOMIC_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: NOMIC_MODEL, texts: [text], task_type: "search_document" }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const e = data?.embeddings?.[0]
    if (!Array.isArray(e) || e.length !== NOMIC_DIMS) return null
    return e
  } catch {
    return null
  }
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32)
}

function embedTextFor(row: TechniqueRow): string {
  const parts = [
    row.technique_slug,
    row.article_markdown,
    `Materials: ${row.real_world_materials.join(", ")}`,
    `Equipment: ${row.real_world_equipment.join(", ")}`,
    `Tips: ${row.tips_and_insights.join(". ")}`,
    `Applications: ${row.common_applications.join(", ")}`,
  ]
  return parts.filter(Boolean).join(". ").slice(0, 6000)
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const countArg = args.find((a) => a.startsWith("--count="))
  const limit = countArg ? parseInt(countArg.split("=")[1], 10) : SEED_TAXONOMY.length

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const nomicKey = process.env.NOMIC_API_KEY

  if (!supabaseUrl || !supabaseKey || !deepseekKey || !nomicKey) {
    console.error("Missing required env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEEPSEEK_API_KEY / NOMIC_API_KEY)")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Check existing slugs so we don't duplicate
  const { data: existing } = await supabase
    .from("manufacturing_technique_enrichments")
    .select("technique_slug")
  const existingSlugs = new Set((existing ?? []).map((r: Record<string, unknown>) => String(r.technique_slug)))

  const toSeed = SEED_TAXONOMY.filter((s) => !existingSlugs.has(s)).slice(0, limit)
  console.log(`Seeding ${toSeed.length} new techniques (${existingSlugs.size} already exist, ${dryRun ? "DRY RUN" : "LIVE"})`)

  let inserted = 0
  let failed = 0

  for (const slug of toSeed) {
    console.log(`  → ${slug}`)
    const row = await generateTechnique(slug, deepseekKey)
    if (!row) {
      failed++
      continue
    }

    const embedding = await nomicEmbedOne(embedTextFor(row), nomicKey)
    if (!embedding) {
      console.warn(`    ✗ ${slug} embed failed`)
      failed++
      continue
    }

    if (dryRun) {
      console.log(`    [dry-run] would insert ${row.technique_slug} + ${embedding.length}-dim embedding`)
      inserted++
      continue
    }

    const embStr = `[${embedding.join(",")}]`
    const contentText = embedTextFor(row)
    const hash = hashContent(contentText)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("manufacturing_technique_enrichments").insert({
      technique_slug: row.technique_slug,
      article_markdown: row.article_markdown,
      real_world_tolerances: row.real_world_tolerances,
      real_world_materials: row.real_world_materials,
      real_world_equipment: row.real_world_equipment,
      tips_and_insights: row.tips_and_insights,
      common_applications: row.common_applications,
      source: "seed_llm_deepseek",
      reviewed: false, // hidden from UI until approved
      embedding: embStr,
      content_hash: hash,
      embedded_at: new Date().toISOString(),
    } as any)

    if (error) {
      console.warn(`    ✗ insert failed: ${error.message?.slice(0, 100)}`)
      failed++
    } else {
      inserted++
      console.log(`    ✓ inserted reviewed=false (${inserted}/${toSeed.length})`)
    }

    // Rate-limit politeness
    await new Promise((r) => setTimeout(r, 250))
  }

  console.log(`\nDone. Inserted: ${inserted}, Failed: ${failed}, Total attempted: ${toSeed.length}`)
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
