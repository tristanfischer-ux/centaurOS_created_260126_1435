#!/usr/bin/env node
/**
 * Standalone embedding backfill script — runs outside Next.js.
 * Fetches marketplace_listings with embedding IS NULL, generates via OpenAI, writes back.
 *
 * Usage: OPENAI_API_KEY=sk-... node scripts/backfill-embeddings.mjs
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jyarhvinengfyrwgtskq.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const EMBEDDING_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 5
const PAGE_SIZE = 1000
const DELAY_BETWEEN_BATCHES_MS = 500

function composeText(listing) {
  const parts = [listing.title]
  if (listing.description) parts.push(listing.description)
  if (listing.subcategory) parts.push(listing.subcategory)
  if (listing.category) parts.push(listing.category)
  if (listing.attributes) {
    const attrs = listing.attributes
    for (const field of ['skills', 'expertise', 'industries', 'previous_companies']) {
      const val = attrs[field]
      if (Array.isArray(val) && val.length > 0) {
        parts.push(val.filter(v => typeof v === 'string').join(' '))
      }
    }
    if (typeof attrs.role === 'string' && attrs.role) parts.push(attrs.role)
    if (typeof attrs.headline === 'string' && attrs.headline) parts.push(attrs.headline)
  }
  return parts.filter(Boolean).join(' ').trim().slice(0, 8000)
}

async function embed(text) {
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text, dimensions: 768 })
  return res.data?.[0]?.embedding ?? null
}

async function main() {
  // INTENT: Fetch listings without embeddings in small pages to avoid statement timeout.
  // The .is('embedding', null) filter is slow on the vector column without an index.
  // Fetch 200 at a time, process, repeat until no more found.
  let totalSucceeded = 0, totalFailed = 0, round = 0

  while (true) {
    round++
    console.log(`\nRound ${round}: fetching next batch of listings without embeddings...`)

    const { data: listings, error } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, category, attributes')
      .is('embedding', null)
      .limit(200)

    if (error) {
      console.error('Fetch error:', error.message)
      // Wait and retry on timeout
      await new Promise(r => setTimeout(r, 5000))
      continue
    }

    if (!listings || listings.length === 0) {
      console.log('No more listings without embeddings.')
      break
    }

    console.log(`  Found ${listings.length} to process`)

    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(async (listing) => {
        const text = composeText(listing)
        if (!text) throw new Error('Empty text')
        const embedding = await embed(text)
        if (!embedding) throw new Error('Null embedding')
        const { error: updateErr } = await supabase
          .from('marketplace_listings')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', listing.id)
        if (updateErr) throw new Error(updateErr.message)
      }))

      for (const r of results) {
        if (r.status === 'fulfilled') totalSucceeded++
        else { totalFailed++; if (totalFailed <= 20) console.error('  Fail:', r.reason?.message) }
      }

      // Rate limit
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
    }

    console.log(`  Round ${round} done. Running total: ${totalSucceeded} ok, ${totalFailed} fail`)
  }

  console.log(`\nComplete: ${totalSucceeded} succeeded, ${totalFailed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
