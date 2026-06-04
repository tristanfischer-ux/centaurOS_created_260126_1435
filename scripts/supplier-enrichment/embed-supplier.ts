/**
 * embed-supplier.ts — the supplier-side embed-on-write guarantee.
 *
 * The growing-DB principle (Tristan): "new suppliers, not just new parts —
 * whenever added, embedded so searchable; always DB-first". The chain already
 * does DB-first lookup of `companies` and writes new web-fallback suppliers
 * back (persist-web-fallback.ts) + deep-enriches them (background-enrichment.ts),
 * but those rows were NOT embedded — only ~48% of `companies` had a
 * `supplier_embeddings` row, so every new web-sourced supplier (and ~15,000
 * legacy rows) was invisible to semantic supplier search.
 *
 * This module is the single, shared embed-on-write path. Both the in-line
 * persist (persist-web-fallback.ts) and the background deep-enrichment
 * (background-enrichment.ts) call `upsertSupplierEmbedding()` immediately after
 * they INSERT/UPDATE a `companies` row, so the INVARIANT holds:
 *
 *   no new `companies` row without a `supplier_embeddings` row.
 *
 * STORAGE FORMAT — critical, differs from pretraining_extracted_parts:
 *   `supplier_embeddings.embedding` is a JSON-array TEXT column ("[-0.038, ...]"),
 *   NOT a Float32LE BLOB. The read side (the dead local-corpus.ts
 *   semanticSupplierSearch + the Nightshift crawler) parses it with JSON.parse.
 *   We therefore store `JSON.stringify(number[])` — the existing 13,771 rows all
 *   use this exact shape (model='text-embedding-3-small', dims=1536,
 *   source_text_hash = sha256(embed_text).slice(0,16)).
 *
 * EMBED MODEL — copied EXACTLY from scripts/lib/background-enrichment.ts
 * (~line 283-303): OpenAI text-embedding-3-small, dimensions: 1536. Same model
 * as every existing row, so new vectors are directly comparable.
 *
 * British spelling throughout (capability, behaviour, organise).
 */
import Database from 'better-sqlite3'
import { createHash } from 'crypto'

export const SUPPLIER_EMBEDDING_MODEL = 'text-embedding-3-small'
export const SUPPLIER_EMBEDDING_DIMS = 1536

/** Loose row shape — only the fields that contribute to the embed-text. Both
 *  callers can pass whatever subset they have; missing fields are skipped. */
export interface SupplierEmbedFields {
  name?: string | null
  description?: string | null
  capability?: string | null
  category?: string | null
  subcategory?: string | null
  specialties?: string | null // JSON array string OR free text
  materials_handled?: string | null // JSON array string OR free text
  certifications?: string | null // JSON array string OR free text
  country?: string | null
  city?: string | null
  /** Any extra enrichment snippet (e.g. raw Brave snippet, recent_news,
   *  capability_oneliner) — appended so retrieval has the freshest context. */
  snippet?: string | null
}

/** Parse a value that may be a JSON array string ('["a","b"]') OR plain text,
 *  returning a flat space-joined string. Never throws. */
function flattenMaybeJsonArray(v: string | null | undefined): string {
  if (!v) return ''
  const t = v.trim()
  if (!t) return ''
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean).join(' ')
    } catch {
      /* fall through to raw text */
    }
  }
  return t
}

/**
 * Build the embed-text for a supplier, matching the existing convention:
 * company name + capability/description + specialties/category + materials +
 * location + the freshest enrichment snippet. Order puts the most
 * discriminating fields first; deduped, trimmed, capped well under the model's
 * 8k-token limit (the embed call also slices to 4096 chars as a backstop).
 */
export function buildSupplierEmbedText(f: SupplierEmbedFields): string {
  const parts: string[] = []
  const push = (s: string | null | undefined) => {
    const t = (s ?? '').trim()
    if (t) parts.push(t)
  }
  push(f.name)
  push(f.capability)
  push(f.description)
  push(f.category)
  push(f.subcategory)
  push(flattenMaybeJsonArray(f.specialties))
  push(flattenMaybeJsonArray(f.materials_handled))
  push(flattenMaybeJsonArray(f.certifications))
  // Location as a single phrase.
  const loc = [f.city, f.country].map((x) => (x ?? '').trim()).filter(Boolean).join(', ')
  push(loc)
  push(f.snippet)
  // Collapse whitespace; the source_text_hash must be stable so re-embedding the
  // same content is a no-op skip.
  return parts.join(' — ').replace(/\s+/g, ' ').trim()
}

/** sha256(embed_text) truncated to 16 hex chars — matches every existing
 *  supplier_embeddings.source_text_hash (length 16). */
export function supplierEmbedHash(embedText: string): string {
  return createHash('sha256').update(embedText).digest('hex').slice(0, 16)
}

/**
 * Call OpenAI text-embedding-3-small and return the raw 1536-float vector.
 * Returns null on any failure (missing key, non-200, wrong dims) so the caller
 * degrades gracefully — the companies row is still written; a later backfill
 * picks up the missing embedding. Identical request shape to
 * background-enrichment.ts embedText().
 */
export async function embedSupplierVector(text: string, openaiKey: string): Promise<number[] | null> {
  if (!openaiKey) return null
  const src = (text || '').trim() || '(empty)'
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: src.slice(0, 4096), model: SUPPLIER_EMBEDDING_MODEL, dimensions: SUPPLIER_EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== SUPPLIER_EMBEDDING_DIMS) return null
    return vec
  } catch {
    return null
  }
}

export type SupplierEmbedAction = 'embedded' | 'skip_existing_hash' | 'skip_no_key' | 'skip_embed_failed' | 'failed'

export interface SupplierEmbedResult {
  action: SupplierEmbedAction
  reason?: string
}

/**
 * Embed-on-write: given an OPEN better-sqlite3 handle, a company_id, and the
 * source fields, embed the supplier and UPSERT its supplier_embeddings row.
 *
 *   - Skips the network call + write when a row already exists with the SAME
 *     source_text_hash (content unchanged → no-op; makes backfill + re-runs
 *     idempotent).
 *   - Re-embeds when the content changed (deep-enrichment added capability /
 *     materials / certifications) so the vector tracks the latest text.
 *   - On a missing OPENAI key or embed failure, leaves the row absent and
 *     returns a skip reason — the companies row is still valid; the backfill
 *     or the next enrichment run will fill it.
 *
 * The DB handle is expected to already have busy_timeout set by the caller
 * (both call sites run `db.pragma('busy_timeout = ...')`); we still defend with
 * an INSERT/UPDATE that is a single statement.
 */
export async function upsertSupplierEmbedding(
  db: Database.Database,
  companyId: string,
  fields: SupplierEmbedFields,
  openaiKey: string,
  supabaseListingId?: string | null,
): Promise<SupplierEmbedResult> {
  if (!companyId) return { action: 'failed', reason: 'no company_id' }
  if (!openaiKey) return { action: 'skip_no_key' }

  const embedText = buildSupplierEmbedText(fields)
  const hash = supplierEmbedHash(embedText)

  // Idempotency: if an embedding for this company already exists with the same
  // source_text_hash, the content is unchanged — skip the costly embed call.
  try {
    const existing = db
      .prepare('SELECT source_text_hash FROM supplier_embeddings WHERE company_id = ? LIMIT 1')
      .get(companyId) as { source_text_hash: string } | undefined
    if (existing && existing.source_text_hash === hash) {
      return { action: 'skip_existing_hash' }
    }
  } catch {
    /* fall through — attempt the write anyway */
  }

  const vec = await embedSupplierVector(embedText, openaiKey)
  if (!vec) return { action: 'skip_embed_failed', reason: 'embed returned null' }

  // JSON-array TEXT — matches the existing supplier_embeddings storage format
  // (NOT a Float32LE BLOB; that is the pretraining_extracted_* convention).
  const embeddingJson = JSON.stringify(vec)
  const nowIso = new Date().toISOString()

  try {
    // UPSERT: company_id is the PRIMARY KEY. On conflict refresh the vector +
    // hash + updated_at, preserving created_at.
    db.prepare(
      `INSERT INTO supplier_embeddings
         (company_id, embedding, source_text_hash, model, dims, supabase_listing_id, created_at, updated_at)
       VALUES (@company_id, @embedding, @source_text_hash, @model, @dims, @supabase_listing_id, @created_at, @updated_at)
       ON CONFLICT(company_id) DO UPDATE SET
         embedding = excluded.embedding,
         source_text_hash = excluded.source_text_hash,
         model = excluded.model,
         dims = excluded.dims,
         supabase_listing_id = COALESCE(excluded.supabase_listing_id, supplier_embeddings.supabase_listing_id),
         updated_at = excluded.updated_at`,
    ).run({
      company_id: companyId,
      embedding: embeddingJson,
      source_text_hash: hash,
      model: SUPPLIER_EMBEDDING_MODEL,
      dims: SUPPLIER_EMBEDDING_DIMS,
      supabase_listing_id: supabaseListingId ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    return { action: 'embedded' }
  } catch (err: any) {
    return { action: 'failed', reason: String(err?.message ?? err).slice(0, 200) }
  }
}
