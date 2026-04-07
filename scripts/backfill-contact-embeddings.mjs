#!/usr/bin/env node
/**
 * Backfill embeddings for vc_pe_contacts table.
 * Joins marketplace_listings to get firm_name (title) for richer embedding text.
 * Usage: OPENAI_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-contact-embeddings.mjs
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

function composeText(c) {
  const parts = [c.full_name]
  if (c.title) parts.push(c.title)
  // firm_name comes from joined marketplace_listings.title
  const firm = c.marketplace_listings?.title
  if (firm) parts.push(firm)
  if (c.deep_bio) parts.push(c.deep_bio)
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
    const { data, error } = await supabase.from('vc_pe_contacts')
      .select('id, full_name, title, deep_bio, listing_id, marketplace_listings(title)')
      .is('embedding', null).limit(200)
    if (error) { console.error('Fetch:', error.message); await new Promise(r => setTimeout(r, 5000)); continue }
    if (!data?.length) { console.log('Done.'); break }
    console.log(`Round ${round}: ${data.length} contacts`)
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(async (c) => {
        const text = composeText(c)
        if (!text) throw new Error('empty')
        const emb = await embed(text)
        if (!emb) throw new Error('null embedding')
        const { error: e } = await supabase.from('vc_pe_contacts').update({ embedding: JSON.stringify(emb) }).eq('id', c.id)
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
