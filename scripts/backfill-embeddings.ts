/**
 * Backfill embedding columns for semantic search.
 *
 * Run after applying migration 20260218110000_semantic_search_embeddings.sql.
 * Requires: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}
if (!openaiKey) {
  throw new Error('Missing OPENAI_API_KEY')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const openai = new OpenAI({ apiKey: openaiKey })

const EMBEDDING_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 50

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  })
  const vec = res.data?.[0]?.embedding
  if (!vec || vec.length !== 1536) throw new Error('Invalid embedding')
  return vec
}

function buildComponentText(row: { name: string; manufacturer?: string | null; part_number?: string | null; tags?: string[] | null; geometry_params?: unknown }): string {
  const parts = [row.name]
  if (row.manufacturer) parts.push(row.manufacturer)
  if (row.part_number) parts.push(row.part_number)
  if (row.tags?.length) parts.push(row.tags.join(' '))
  if (row.geometry_params && typeof row.geometry_params === 'object') {
    parts.push(JSON.stringify(row.geometry_params))
  }
  return parts.join(' ')
}

function buildCompatibilityText(row: { component_a: string; component_b: string; relationship: string; notes?: string | null; domain?: string | null }): string {
  const parts = [row.component_a, row.relationship, row.component_b]
  if (row.domain) parts.push(row.domain)
  if (row.notes) parts.push(row.notes)
  return parts.join(' ')
}

function buildTutorialText(row: { title: string; description?: string | null; topic?: string | null; tags?: string[] | null }): string {
  const parts = [row.title]
  if (row.description) parts.push(row.description)
  if (row.topic) parts.push(row.topic)
  if (row.tags?.length) parts.push(row.tags.join(' '))
  return parts.join(' ')
}

function buildProjectTemplateText(row: { title: string; description?: string | null; category?: string | null; tags?: string[] | null; bom?: unknown }): string {
  const parts = [row.title]
  if (row.description) parts.push(row.description)
  if (row.category) parts.push(row.category)
  if (row.tags?.length) parts.push(row.tags.join(' '))
  if (row.bom && Array.isArray(row.bom)) {
    parts.push((row.bom as { name?: string }[]).map((b) => b.name).filter(Boolean).join(' '))
  }
  return parts.join(' ')
}

function buildMarketplaceText(row: { title: string; description?: string | null; category?: string; subcategory?: string | null; attributes?: unknown }): string {
  const parts = [row.title]
  if (row.description) parts.push(row.description)
  if (row.category) parts.push(row.category)
  if (row.subcategory) parts.push(row.subcategory)
  if (row.attributes && typeof row.attributes === 'object') {
    parts.push(JSON.stringify(row.attributes))
  }
  return parts.join(' ')
}

async function backfillTable(
  table: string,
  selectColumns: string,
  rows: { id: string; [k: string]: unknown }[],
  buildText: (row: Record<string, unknown>) => string
): Promise<number> {
  let updated = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        const text = buildText(row)
        if (!text.trim()) return
        const vector = await embed(text)
        const { error } = await supabase.from(table).update({ embedding: vector }).eq('id', row.id)
        if (!error) updated++
      })
    )
    console.log(`  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`)
  }
  return updated
}

async function main(): Promise<void> {
  console.log('Backfilling embeddings...')

  const { data: components } = await supabase.from('component_catalogue').select('id, name, manufacturer, part_number, tags, geometry_params').is('embedding', null)
  if (components?.length) {
    console.log(`component_catalogue: ${components.length} rows`)
    const n = await backfillTable('component_catalogue', 'id, name, manufacturer, part_number, tags, geometry_params', components as { id: string; [k: string]: unknown }[], buildComponentText)
    console.log(`  Updated ${n}`)
  }

  const { data: compat } = await supabase.from('component_compatibility').select('id, component_a, component_b, relationship, notes, domain').is('embedding', null)
  if (compat?.length) {
    console.log(`component_compatibility: ${compat.length} rows`)
    const n = await backfillTable('component_compatibility', 'id, component_a, component_b, relationship, notes, domain', compat as { id: string; [k: string]: unknown }[], buildCompatibilityText)
    console.log(`  Updated ${n}`)
  }

  const { data: tutorials } = await supabase.from('tutorials').select('id, title, description, topic, tags').is('embedding', null)
  if (tutorials?.length) {
    console.log(`tutorials: ${tutorials.length} rows`)
    const n = await backfillTable('tutorials', 'id, title, description, topic, tags', tutorials as { id: string; [k: string]: unknown }[], buildTutorialText)
    console.log(`  Updated ${n}`)
  }

  const { data: templates } = await supabase.from('project_templates').select('id, title, description, category, tags, bom').is('embedding', null)
  if (templates?.length) {
    console.log(`project_templates: ${templates.length} rows`)
    const n = await backfillTable('project_templates', 'id, title, description, category, tags, bom', templates as { id: string; [k: string]: unknown }[], buildProjectTemplateText)
    console.log(`  Updated ${n}`)
  }

  const { data: listings } = await supabase.from('marketplace_listings').select('id, title, description, category, subcategory, attributes').is('embedding', null)
  if (listings?.length) {
    console.log(`marketplace_listings: ${listings.length} rows`)
    const n = await backfillTable('marketplace_listings', 'id, title, description, category, subcategory, attributes', listings as { id: string; [k: string]: unknown }[], buildMarketplaceText)
    console.log(`  Updated ${n}`)
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
