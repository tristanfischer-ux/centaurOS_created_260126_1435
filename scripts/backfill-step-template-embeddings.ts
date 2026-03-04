/**
 * Backfill embedding column for step_templates semantic search.
 *
 * Run after applying migration 20260227600000_step_template_embeddings.sql.
 * Requires: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npx tsx scripts/backfill-step-template-embeddings.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

config({ path: process.env.DOTENV_PATH || '.env.local' })

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

function buildStepTemplateText(row: {
  name: string
  category: string
  subcategory?: string | null
  description?: string | null
  tags?: string[] | null
}): string {
  const parts = [row.name, row.category]
  if (row.subcategory) parts.push(row.subcategory)
  if (row.description) parts.push(row.description)
  if (row.tags?.length) parts.push(row.tags.join(' '))
  return parts.join(' ')
}

async function main(): Promise<void> {
  console.log('Backfilling step_templates embeddings...')

  // Fetch all step_templates without embeddings
  const { data: templates, error } = await supabase
    .from('step_templates')
    .select('slug, name, category, subcategory, description, tags')
    .is('embedding', null)

  if (error) {
    throw new Error(`Failed to fetch step_templates: ${error.message}`)
  }

  if (!templates?.length) {
    console.log('No step_templates to backfill.')
    return
  }

  console.log(`Found ${templates.length} step_templates without embeddings`)

  let updated = 0
  for (let i = 0; i < templates.length; i += BATCH_SIZE) {
    const batch = templates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        const text = buildStepTemplateText(row)
        if (!text.trim()) return
        try {
          const vector = await embed(text)
          const { error: updateErr } = await supabase
            .from('step_templates')
            .update({ embedding: vector })
            .eq('slug', row.slug)
          if (!updateErr) updated++
        } catch (err) {
          console.warn(`  Failed to embed ${row.slug}:`, err instanceof Error ? err.message : err)
        }
      })
    )
    console.log(`  Progress: ${Math.min(i + BATCH_SIZE, templates.length)} / ${templates.length}`)
  }

  console.log(`Done. Updated ${updated} / ${templates.length} step_templates.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
