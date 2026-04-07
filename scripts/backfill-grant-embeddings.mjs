#!/usr/bin/env node
/**
 * Backfill embeddings for investor_grants table.
 * Usage: OPENAI_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-grant-embeddings.mjs
 */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jyarhvinengfyrwgtskq.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY
if (!SUPABASE_KEY || !OPENAI_KEY) { console.error('Missing env vars'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })
const BATCH_SIZE = 5, DELAY_MS = 500

function composeText(g) {
  const parts = [g.grant_name]
  if (g.managing_body) parts.push(g.managing_body)
  if (g.description) parts.push(g.description)
  if (g.sector_focus?.length) parts.push(g.sector_focus.join(' '))
  if (g.stage_focus?.length) parts.push(g.stage_focus.join(' '))
  if (g.eligibility_summary) parts.push(g.eligibility_summary)
  return parts.filter(Boolean).join(' ').trim().slice(0, 8000)
}

async function embed(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data?.[0]?.embedding ?? null
}

async function main() {
  let ok = 0, fail = 0, round = 0
  while (true) {
    round++
    const { data, error } = await supabase.from('investor_grants')
      .select('id, grant_name, managing_body, description, sector_focus, stage_focus, eligibility_summary')
      .is('embedding', null).limit(200)
    if (error) { console.error('Fetch:', error.message); await new Promise(r => setTimeout(r, 5000)); continue }
    if (!data?.length) { console.log('Done.'); break }
    console.log(`Round ${round}: ${data.length} grants`)
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(async (g) => {
        const text = composeText(g)
        if (!text) throw new Error('empty')
        const emb = await embed(text)
        if (!emb) throw new Error('null embedding')
        const { error: e } = await supabase.from('investor_grants').update({ embedding: JSON.stringify(emb) }).eq('id', g.id)
        if (e) throw new Error(e.message)
      }))
      for (const r of results) r.status === 'fulfilled' ? ok++ : fail++
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
    console.log(`  Total: ${ok} ok, ${fail} fail`)
  }
  console.log(`\nComplete: ${ok} succeeded, ${fail} failed`)
}
main().catch(e => { console.error('Fatal:', e); process.exit(1) })
