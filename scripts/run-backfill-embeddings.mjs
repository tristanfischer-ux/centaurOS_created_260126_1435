/**
 * One-time script to backfill marketplace_listings embeddings.
 * Run: node scripts/run-backfill-embeddings.mjs
 */

import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

// Load .env.local
const envFile = readFileSync(".env.local", "utf-8")
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=")
      return [l.slice(0, idx), l.slice(idx + 1).replace(/^["']|["']$/g, "").replace(/\\n/g, "").trim()]
    })
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = env.OPENAI_API_KEY

if (!supabaseUrl || !supabaseKey || !openaiKey) {
  console.error("Missing required env vars")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const openai = new OpenAI({ apiKey: openaiKey })

// Fetch listings with NULL embedding
const { data: listings, error } = await supabase
  .from("marketplace_listings")
  .select("id, title, description, subcategory, category")
  .is("embedding", null)

if (error) {
  console.error("Failed to fetch listings:", error.message)
  process.exit(1)
}

console.log(`Found ${listings.length} listings with NULL embedding`)

if (listings.length === 0) {
  console.log("Nothing to backfill.")
  process.exit(0)
}

let succeeded = 0
let failed = 0

// Process in batches of 10
const BATCH_SIZE = 10
for (let i = 0; i < listings.length; i += BATCH_SIZE) {
  const batch = listings.slice(i, i + BATCH_SIZE)
  console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(listings.length / BATCH_SIZE)} (${batch.length} listings)...`)

  const results = await Promise.allSettled(
    batch.map(async (listing) => {
      const text = [listing.title, listing.description, listing.subcategory, listing.category]
        .filter(Boolean)
        .join(" ")
        .trim()
        .slice(0, 8000)

      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      })

      const embedding = res.data?.[0]?.embedding
      if (!embedding || embedding.length !== 1536) {
        throw new Error(`Bad embedding for ${listing.id}: got ${embedding?.length ?? 0} dims`)
      }

      const { error: updateError } = await supabase
        .from("marketplace_listings")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", listing.id)

      if (updateError) throw new Error(updateError.message)
      return listing.id
    })
  )

  for (const r of results) {
    if (r.status === "fulfilled") {
      succeeded++
    } else {
      failed++
      console.error("  FAIL:", r.reason?.message ?? r.reason)
    }
  }
}

console.log(`\nDone: ${succeeded}/${listings.length} succeeded, ${failed} failed`)
