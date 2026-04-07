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
const BATCH_SIZE = 10
const PAGE_SIZE = 1000

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
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text })
  return res.data?.[0]?.embedding ?? null
}

async function main() {
  // Paginate to get all listings with missing embeddings
  let allListings = []
  let page = 0
  let hasMore = true
  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, category, attributes')
      .is('embedding', null)
      .range(from, to)
    if (error) { console.error('Fetch error:', error.message); break }
    allListings = allListings.concat(data ?? [])
    hasMore = (data ?? []).length === PAGE_SIZE
    page++
  }

  console.log(`Found ${allListings.length} listings missing embeddings`)
  if (allListings.length === 0) return

  let succeeded = 0, failed = 0

  for (let i = 0; i < allListings.length; i += BATCH_SIZE) {
    const batch = allListings.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(async (listing) => {
      const text = composeText(listing)
      if (!text) throw new Error('Empty text')
      const embedding = await embed(text)
      if (!embedding) throw new Error('Null embedding')
      const { error } = await supabase
        .from('marketplace_listings')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', listing.id)
      if (error) throw new Error(error.message)
    }))

    for (const r of results) {
      if (r.status === 'fulfilled') succeeded++
      else { failed++; if (failed <= 10) console.error('  Fail:', r.reason?.message) }
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= allListings.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, allListings.length)}/${allListings.length} (${succeeded} ok, ${failed} fail)`)
    }
  }

  console.log(`\nDone: ${succeeded}/${allListings.length} succeeded, ${failed} failed`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
