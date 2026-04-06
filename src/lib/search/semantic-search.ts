/**
 * @file semantic-search.ts
 *
 * @description Semantic search for engineering RAG: embed queries via OpenAI
 * and retrieve relevant components, compatibility pairs, tutorials, project
 * templates, and marketplace listings from pgvector-backed tables.
 *
 * @related supabase/migrations/20260218110000_semantic_search_embeddings.sql
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export interface SemanticComponentHit {
  id: string
  name: string
  manufacturer: string | null
  part_number: string | null
  geometry_type_slug: string
  tags: string[] | null
  similarity: number
}

export interface SemanticCompatibilityHit {
  id: string
  component_a: string
  component_b: string
  relationship: string
  notes: string | null
  domain: string | null
  confidence: number | null
  similarity: number
}

export interface SemanticTutorialHit {
  id: string
  title: string
  slug: string
  description: string | null
  topic: string | null
  difficulty: string | null
  similarity: number
}

export interface SemanticProjectTemplateHit {
  id: string
  title: string
  slug: string
  description: string | null
  category: string | null
  difficulty: string | null
  similarity: number
}

export interface SemanticMarketplaceHit {
  id: string
  category: string
  subcategory: string | null
  title: string
  description: string | null
  similarity: number
}

export interface EngineeringRAGResult {
  components: SemanticComponentHit[]
  compatibility: SemanticCompatibilityHit[]
  tutorials: SemanticTutorialHit[]
  projectTemplates: SemanticProjectTemplateHit[]
  marketplaceListings: SemanticMarketplaceHit[]
}

export interface RetrieveForEngineeringOptions {
  matchThreshold?: number
  componentLimit?: number
  compatibilityLimit?: number
  tutorialLimit?: number
  projectTemplateLimit?: number
  marketplaceLimit?: number
}

/**
 * Generates an embedding vector for the given text using OpenAI.
 *
 * @param text - Input text to embed (max ~8k tokens for text-embedding-3-small)
 * @returns Array of 1536 floats, or null if API is unavailable
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const trimmed = text.trim().slice(0, 8000)
  if (!trimmed) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey })
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    })
    const embedding = res.data?.[0]?.embedding
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) return null
    return embedding
  } catch (err) {
    console.warn('[SemanticSearch] Embedding failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Retrieves context for engineering recommendations: components, compatibility
 * pairs, tutorials, project templates, and marketplace listings by semantic
 * similarity to the query. Use before AI prompts to ground recommendations.
 *
 * @param query - Natural language query (e.g. product description, research summary)
 * @param options - Optional limits and threshold
 * @returns Combined RAG result; arrays may be empty if embedding or RPC fails
 */
export async function retrieveForEngineeringQuery(
  query: string,
  options: RetrieveForEngineeringOptions = {}
): Promise<EngineeringRAGResult> {
  const {
    matchThreshold = 0.4,
    componentLimit = 10,
    compatibilityLimit = 15,
    tutorialLimit = 8,
    projectTemplateLimit = 6,
    marketplaceLimit = 10,
  } = options

  const empty: EngineeringRAGResult = {
    components: [],
    compatibility: [],
    tutorials: [],
    projectTemplates: [],
    marketplaceListings: [],
  }

  const embedding = await embedText(query)
  if (!embedding) return empty

  const supabase = await createClient()

  const embeddingStr = JSON.stringify(embedding)

  const [compRes, compatRes, tutRes, ptRes, mlRes] = await Promise.all([
    supabase.rpc('match_components', {
      query_embedding: embeddingStr,
      match_threshold: matchThreshold,
      match_count: componentLimit,
    }),
    supabase.rpc('match_component_compatibility', {
      query_embedding: embeddingStr,
      match_threshold: matchThreshold,
      match_count: compatibilityLimit,
    }),
    supabase.rpc('match_tutorials', {
      query_embedding: embeddingStr,
      match_threshold: matchThreshold,
      match_count: tutorialLimit,
    }),
    supabase.rpc('match_project_templates', {
      query_embedding: embeddingStr,
      match_threshold: matchThreshold,
      match_count: projectTemplateLimit,
    }),
    supabase.rpc('match_marketplace_listings', {
      query_embedding: embeddingStr,
      match_threshold: matchThreshold,
      match_count: marketplaceLimit,
    }),
  ])

  return {
    components: (compRes.data ?? []) as SemanticComponentHit[],
    compatibility: (compatRes.data ?? []) as SemanticCompatibilityHit[],
    tutorials: (tutRes.data ?? []) as SemanticTutorialHit[],
    projectTemplates: (ptRes.data ?? []) as SemanticProjectTemplateHit[],
    marketplaceListings: (mlRes.data ?? []) as SemanticMarketplaceHit[],
  }
}

/**
 * Formats RAG result into a single text block for injection into an AI prompt.
 * Use in cad-lab and other recommendation prompts.
 */
export function formatRAGContextForPrompt(rag: EngineeringRAGResult): string {
  const sections: string[] = []

  if (rag.components.length > 0) {
    sections.push(
      '## Available components (from catalogue)\n' +
        'Prefer datasheet-verified specs over training estimates when a component is marked verified.\n' +
        rag.components
          .map(
            (c) =>
              `- ${c.name}${c.manufacturer ? ` (${c.manufacturer})` : ''} | type: ${c.geometry_type_slug}${c.tags?.length ? ` | tags: ${c.tags.join(', ')}` : ''}`
          )
          .join('\n')
    )
  }

  if (rag.compatibility.length > 0) {
    sections.push(
      '## Known compatibility pairs\n' +
        rag.compatibility
          .map(
            (c) =>
              `- ${c.component_a} ${c.relationship} ${c.component_b}${c.domain ? ` (${c.domain})` : ''}${c.notes ? `: ${c.notes}` : ''}`
          )
          .join('\n')
    )
  }

  if (rag.tutorials.length > 0) {
    sections.push(
      '## Relevant tutorials\n' +
        rag.tutorials
          .map(
            (t) =>
              `- ${t.title} (${t.topic ?? 'general'}, ${t.difficulty ?? 'any'})${t.description ? `: ${t.description.slice(0, 120)}...` : ''}`
          )
          .join('\n')
    )
  }

  if (rag.projectTemplates.length > 0) {
    sections.push(
      '## Relevant project templates\n' +
        rag.projectTemplates
          .map(
            (p) =>
              `- ${p.title} (${p.category ?? 'general'})${p.description ? `: ${p.description.slice(0, 120)}...` : ''}`
          )
          .join('\n')
    )
  }

  if (sections.length === 0) return ''
  return '\n\n--- Retrieved context (use where relevant) ---\n' + sections.join('\n\n') + '\n--- End retrieved context ---\n'
}

// ==========================================
// MARKETPLACE LISTING EMBEDDING HELPERS
// ==========================================

/**
 * Composes rich text for embedding a marketplace listing.
 * Includes structured attributes (skills, industries, expertise, role) for
 * better semantic matching beyond just title + description.
 *
 * @param listing - Listing data with at least title; other fields optional
 * @returns Space-joined text string ready for embedding (max 8000 chars handled by embedText)
 */
export function composeListingEmbeddingText(listing: {
  title: string
  description?: string | null
  subcategory?: string | null
  category?: string | null
  attributes?: Record<string, unknown> | null
}): string {
  const parts: string[] = [listing.title]

  if (listing.description) parts.push(listing.description)
  if (listing.subcategory) parts.push(listing.subcategory)
  if (listing.category) parts.push(listing.category)

  if (listing.attributes) {
    const attrs = listing.attributes
    const arrFields = ['skills', 'expertise', 'industries', 'previous_companies'] as const
    for (const field of arrFields) {
      const val = attrs[field]
      if (Array.isArray(val) && val.length > 0) {
        parts.push(val.filter((v): v is string => typeof v === 'string').join(' '))
      }
    }
    if (typeof attrs.role === 'string' && attrs.role) parts.push(attrs.role)
    if (typeof attrs.headline === 'string' && attrs.headline) parts.push(attrs.headline)
  }

  return parts.filter(Boolean).join(' ')
}

/**
 * Generates and persists an embedding for a single marketplace listing.
 * Fire-and-forget safe: catches all errors, logs warnings, never throws.
 *
 * @param listingId - UUID of the marketplace_listing to embed
 */
export async function embedMarketplaceListing(listingId: string): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { data: listing, error: fetchError } = await supabase
      .from('marketplace_listings')
      .select('id, title, description, subcategory, category, attributes')
      .eq('id', listingId)
      .single()

    if (fetchError || !listing) {
      console.warn('[EmbedListing] Fetch failed:', fetchError?.message ?? 'not found')
      return
    }

    const text = composeListingEmbeddingText(listing as {
      title: string
      description: string | null
      subcategory: string | null
      category: string | null
      attributes: Record<string, unknown> | null
    })

    const embedding = await embedText(text)
    if (!embedding) {
      console.warn('[EmbedListing] embedText returned null for listing', listingId)
      return
    }

    const { error: updateError } = await supabase
      .from('marketplace_listings')
      .update({ embedding: JSON.stringify(embedding) } as Record<string, unknown>)
      .eq('id', listingId)

    if (updateError) {
      console.warn('[EmbedListing] Update failed:', updateError.message)
    }
  } catch (err) {
    console.warn('[EmbedListing] Unexpected error:', err instanceof Error ? err.message : err)
  }
}

/**
 * Semantic search against marketplace_listings via pgvector RPC.
 * Returns listing IDs with similarity scores. Caller joins with full data.
 * Returns empty array on any failure (graceful degradation).
 *
 * @param queryText - Natural language search query
 * @param options - Optional threshold and count overrides
 */
export async function searchMarketplaceListingsSemantic(
  queryText: string,
  options?: { matchThreshold?: number; matchCount?: number }
): Promise<SemanticMarketplaceHit[]> {
  try {
    const embedding = await embedText(queryText)
    if (!embedding) return []

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('match_marketplace_listings', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: options?.matchThreshold ?? 0.35,
      match_count: options?.matchCount ?? 25,
    })

    if (error) {
      console.warn('[SemanticSearch] RPC failed:', error.message)
      return []
    }

    return (data ?? []) as SemanticMarketplaceHit[]
  } catch (err) {
    console.warn('[SemanticSearch] Unexpected error:', err instanceof Error ? err.message : err)
    return []
  }
}
