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
  const apiKey = process.env.OPENAI_API_KEY
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

  const [compRes, compatRes, tutRes, ptRes, mlRes] = await Promise.all([
    supabase.rpc('match_components', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: componentLimit,
    }),
    supabase.rpc('match_component_compatibility', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: compatibilityLimit,
    }),
    supabase.rpc('match_tutorials', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: tutorialLimit,
    }),
    supabase.rpc('match_project_templates', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: projectTemplateLimit,
    }),
    supabase.rpc('match_marketplace_listings', {
      query_embedding: embedding,
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
