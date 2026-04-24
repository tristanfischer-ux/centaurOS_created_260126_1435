/**
 * @file semantic-search.ts
 *
 * @description Semantic search for engineering RAG: embed queries via OpenAI
 * and retrieve relevant components, compatibility pairs, tutorials, project
 * templates, and marketplace listings from pgvector-backed tables.
 *
 * @related supabase/migrations/20260218110000_semantic_search_embeddings.sql
 */

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

  const supabase = createAdminClient()

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

    // Supplier / People / Services / Products shape (existing — keep)
    const arrFields = ['skills', 'expertise', 'industries', 'previous_companies'] as const
    for (const field of arrFields) {
      const val = attrs[field]
      if (Array.isArray(val) && val.length > 0) {
        parts.push(val.filter((v): v is string => typeof v === 'string').join(' '))
      }
    }
    if (typeof attrs.role === 'string' && attrs.role) parts.push(attrs.role)
    if (typeof attrs.headline === 'string' && attrs.headline) parts.push(attrs.headline)

    // Investor / Finance shape — added 2026-04-24 to fix /investors search noise.
    // Pre-fix, every investor's signature was ~"firm name + VC Fund + Finance" — semantically meaningless.
    // 8,264 of 8,264 Finance rows have stage_focus/sectors/firm_type populated; 8,068+ have
    // investment_thesis/portfolio/cheque_range/value_add. Embedding these fields is the dominant
    // quality lever for /investors per main-session handover 2026-04-24.
    if (listing.category === 'Finance') {
      const arrJoin = (val: unknown): string =>
        Array.isArray(val)
          ? val.filter((v): v is string => typeof v === 'string').join(' ')
          : ''

      // Headline thesis — most semantically dense field
      if (typeof attrs.investment_thesis === 'string' && attrs.investment_thesis) {
        parts.push(`Thesis: ${attrs.investment_thesis}`)
      }
      if (typeof attrs.firm_type === 'string' && attrs.firm_type) {
        parts.push(`Firm type: ${attrs.firm_type}`)
      }
      const stages = arrJoin(attrs.stage_focus)
      if (stages) parts.push(`Stages: ${stages}`)
      const sectors = arrJoin(attrs.sectors)
      if (sectors) parts.push(`Sectors: ${sectors}`)
      const geos = arrJoin(attrs.geo_focus)
      if (geos) parts.push(`Geographies: ${geos}`)
      const portfolio = arrJoin(attrs.notable_portfolio) || arrJoin(attrs.portfolio_companies)
      if (portfolio) parts.push(`Portfolio: ${portfolio}`)
      if (typeof attrs.team_expertise === 'string' && attrs.team_expertise) {
        parts.push(`Team expertise: ${attrs.team_expertise}`)
      }
      if (typeof attrs.value_add === 'string' && attrs.value_add) {
        parts.push(`Value add: ${attrs.value_add}`)
      }
      if (typeof attrs.recent_deals_summary === 'string' && attrs.recent_deals_summary) {
        parts.push(`Recent deals: ${attrs.recent_deals_summary}`)
      }
      if (typeof attrs.ideal_company_profile === 'string' && attrs.ideal_company_profile) {
        parts.push(`Ideal company: ${attrs.ideal_company_profile}`)
      }
      // Cheque range — render as natural-language phrase
      if (attrs.cheque_range_gbp && typeof attrs.cheque_range_gbp === 'object') {
        const r = attrs.cheque_range_gbp as { min?: number; max?: number }
        if (typeof r.min === 'number' || typeof r.max === 'number') {
          const min = typeof r.min === 'number' ? `£${r.min.toLocaleString()}` : '?'
          const max = typeof r.max === 'number' ? `£${r.max.toLocaleString()}` : '?'
          parts.push(`Cheque range: ${min}–${max}`)
        }
      }
      if (typeof attrs.fund_size_gbp === 'number') {
        parts.push(`Fund size: £${attrs.fund_size_gbp.toLocaleString()}`)
      }
    }
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

    const supabase = createAdminClient()
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

// ── Investor Semantic Search ──────────────────────────────────────────

export interface SemanticHit {
  id: string
  similarity: number
}

/**
 * Compose embedding text for an investor grant.
 * Covers grant_name + managing_body + description + sector/stage focus + eligibility.
 */
export function composeGrantEmbeddingText(grant: {
  grant_name: string
  managing_body?: string | null
  description?: string | null
  sector_focus?: string[] | null
  stage_focus?: string[] | null
  eligibility_summary?: string | null
}): string {
  const parts: string[] = [grant.grant_name]
  if (grant.managing_body) parts.push(grant.managing_body)
  if (grant.description) parts.push(grant.description)
  if (grant.sector_focus?.length) parts.push(grant.sector_focus.join(' '))
  if (grant.stage_focus?.length) parts.push(grant.stage_focus.join(' '))
  if (grant.eligibility_summary) parts.push(grant.eligibility_summary)
  return parts.filter(Boolean).join(' ')
}

/**
 * Compose embedding text for a portfolio company.
 */
export function composePortfolioCompanyEmbeddingText(company: {
  company_name: string
  sector?: string | null
  stage?: string | null
  description?: string | null
}): string {
  const parts: string[] = [company.company_name]
  if (company.sector) parts.push(company.sector)
  if (company.stage) parts.push(company.stage)
  if (company.description) parts.push(company.description)
  return parts.filter(Boolean).join(' ')
}

/**
 * Compose embedding text for a VC/PE contact.
 */
export function composeContactEmbeddingText(contact: {
  full_name: string
  title?: string | null
  firm_name?: string | null
  bio?: string | null
}): string {
  const parts: string[] = [contact.full_name]
  if (contact.title) parts.push(contact.title)
  if (contact.firm_name) parts.push(contact.firm_name)
  if (contact.bio) parts.push(contact.bio)
  return parts.filter(Boolean).join(' ')
}

/**
 * Semantic search against investor_grants via pgvector RPC.
 * Returns grant IDs with similarity scores. Caller joins with full data.
 */
export async function searchGrantsSemantic(
  queryText: string,
  options?: { matchThreshold?: number; matchCount?: number }
): Promise<SemanticHit[]> {
  try {
    const embedding = await embedText(queryText)
    if (!embedding) return []

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('match_investor_grants', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: options?.matchThreshold ?? 0.4,
      match_count: options?.matchCount ?? 25,
    })

    if (error) {
      console.warn('[SearchGrants] RPC failed:', error.message)
      return []
    }
    return (data ?? []) as SemanticHit[]
  } catch (err) {
    console.warn('[SearchGrants] Error:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Semantic search against investor_portfolio_companies via pgvector RPC.
 * Higher match_count (50) to account for deduplication by company_name.
 */
export async function searchPortfolioCompaniesSemantic(
  queryText: string,
  options?: { matchThreshold?: number; matchCount?: number }
): Promise<SemanticHit[]> {
  try {
    const embedding = await embedText(queryText)
    if (!embedding) return []

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('match_portfolio_companies', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: options?.matchThreshold ?? 0.4,
      match_count: options?.matchCount ?? 50,
    })

    if (error) {
      console.warn('[SearchPortfolio] RPC failed:', error.message)
      return []
    }
    return (data ?? []) as SemanticHit[]
  } catch (err) {
    console.warn('[SearchPortfolio] Error:', err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Semantic search against vc_pe_contacts via pgvector RPC.
 */
export async function searchContactsSemantic(
  queryText: string,
  options?: { matchThreshold?: number; matchCount?: number }
): Promise<SemanticHit[]> {
  try {
    const embedding = await embedText(queryText)
    if (!embedding) return []

    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('match_vc_pe_contacts', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: options?.matchThreshold ?? 0.4,
      match_count: options?.matchCount ?? 25,
    })

    if (error) {
      console.warn('[SearchContacts] RPC failed:', error.message)
      return []
    }
    return (data ?? []) as SemanticHit[]
  } catch (err) {
    console.warn('[SearchContacts] Error:', err instanceof Error ? err.message : err)
    return []
  }
}
