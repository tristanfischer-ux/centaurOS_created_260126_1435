/**
 * @file backfill-knowledge-embeddings.ts
 *
 * @description One-time script to generate embeddings for existing knowledge_notes
 * that don't have one yet. Processes in batches of 20 with 500ms delay between
 * batches to respect OpenAI rate limits.
 *
 * Usage: npx tsx scripts/backfill-knowledge-embeddings.ts
 *
 * Requires: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"

const BATCH_SIZE = 20
const DELAY_MS = 500
const EMBEDDING_MODEL = "text-embedding-3-small"
const EMBEDDING_DIMENSIONS = 1536

async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, 8000)
  if (!trimmed) return null

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: trimmed }),
  })

  if (!res.ok) {
    console.warn(`Embedding API error: ${res.status} ${res.statusText}`)
    return null
  }

  const data = await res.json()
  const embedding = data?.data?.[0]?.embedding
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return null
  return embedding
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Fetch ALL notes (embedding column isn't reliably filterable via JS client)
  // We'll check each note and skip if it already has an embedding
  const { data: allNotes, error: fetchErr } = await supabase
    .from("knowledge_notes")
    .select("id, title, description, content")
    .order("created_at", { ascending: true })

  if (fetchErr || !allNotes) {
    console.error("Failed to fetch notes:", fetchErr?.message)
    process.exit(1)
  }

  console.log(`Found ${allNotes.length} total notes — checking which need embeddings...`)

  let processed = 0
  let failed = 0
  let skipped = 0

  // Process in batches
  for (let offset = 0; offset < allNotes.length; offset += BATCH_SIZE) {
    const batch = allNotes.slice(offset, offset + BATCH_SIZE)

    for (const note of batch) {
      const text = `${note.title}\n${note.description ?? ""}\n${note.content}`.trim()
      const embedding = await embedText(text, openaiKey)

      if (embedding) {
        // GOTCHA: PostgREST schema cache doesn't expose pgvector columns.
        // Must use Supabase's pg_graphql SQL endpoint or direct DB connection.
        // Using the Supabase SQL API (via the /pg endpoint).
        const embeddingStr = `[${embedding.join(",")}]`
        const { error: sqlErr } = await supabase
          .from("knowledge_notes")
          .update({ embedding: embeddingStr } as any)
          .eq("id", note.id)

        // If JS client fails (expected), use raw SQL via Supabase edge function
        if (sqlErr) {
          // Workaround: Create a one-off RPC to run the update
          try {
            const { error: rpcErr } = await supabase.rpc("update_knowledge_embedding" as any, {
              p_note_id: note.id,
              p_embedding: embeddingStr,
            })
            if (rpcErr) {
              console.warn(`  ✗ ${note.id} RPC failed: ${rpcErr.message?.slice(0, 80)}`)
              failed++
            } else {
              processed++
            }
          } catch {
            console.warn(`  ✗ ${note.id} all update methods failed`)
            failed++
          }
        } else {
          processed++
        }
      } else {
        console.warn(`  ✗ ${note.id} embedding failed`)
        failed++
      }
    }

    const pct = Math.round(((offset + batch.length) / allNotes.length) * 100)
    console.log(`  Progress: ${offset + batch.length}/${allNotes.length} (${pct}%) — ${processed} embedded, ${skipped} skipped, ${failed} failed`)

    // Rate limit delay
    if (offset + BATCH_SIZE < allNotes.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`\nDone. Embedded: ${processed}, Skipped: ${skipped}, Failed: ${failed}, Total: ${allNotes.length}`)
}

main().catch((err) => {
  console.error("Backfill failed:", err)
  process.exit(1)
})
