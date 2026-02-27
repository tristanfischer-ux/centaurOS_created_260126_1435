"use server"

/**
 * @file step-template-matching.ts — Hybrid keyword + semantic matching of step_templates.
 *
 * @description Combines two scoring signals to find the best STEP template for a module:
 *
 * 1. **Keyword scoring** (original): tokenize module context, score each template by
 *    keyword overlap in name/category/subcategory/description/tags. Fast, no API call.
 *
 * 2. **Semantic scoring** (new): embed the module description via OpenAI, query the
 *    `match_step_templates` RPC for cosine similarity. Catches conceptual matches that
 *    keyword overlap misses (e.g. "motor mount" ↔ "stepper bracket").
 *
 * Hybrid formula: `hybridScore = keywordNorm * 0.4 + semanticScore * 0.6`
 *
 * Three tiers:
 * - **Seed** (≥ HYBRID_SEED_THRESHOLD): STEP file loaded as starting geometry
 * - **Reference** (≥ HYBRID_REFERENCE_THRESHOLD): dimensions/description injected into prompt
 * - **Below threshold**: not used
 *
 * Graceful degradation: if embedText() returns null (no API key, rate limit),
 * falls back to pure keyword scoring with original SEED_THRESHOLD.
 *
 * @security Server-side only. Reads from step_templates (public read).
 * Template metadata is sanitised before prompt injection (see sanitiseForPrompt).
 */

import { createClient } from "@/lib/supabase/server"
import { embedText } from "@/lib/search/semantic-search"

// ─── Types ───────────────────────────────────────────────────────────

export interface TemplateMatch {
  slug: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  stepUrl: string
  /** Combined hybrid score (0–1) or raw keyword score in fallback mode */
  score: number
  /** Tags from template metadata */
  tags?: string[] | null
}

export interface TemplateMatchResult {
  /** Top 3 matches by score (may be empty) */
  topMatches: TemplateMatch[]
  /** Best match if score >= seed threshold, otherwise null */
  seedTemplate: TemplateMatch | null
  /** Templates above reference threshold but below seed — dimensions/description for prompt */
  referenceTemplates: TemplateMatch[]
}

// ─── Constants ───────────────────────────────────────────────────────

/**
 * Minimum raw keyword score for seed geometry (pure-keyword fallback mode).
 * Kept for backward compatibility when semantic search is unavailable.
 */
const SEED_THRESHOLD = 6

/** Hybrid score threshold for seed geometry (STEP file loaded) */
const HYBRID_SEED_THRESHOLD = 0.55

/** Hybrid score threshold for reference templates (dimensions injected into prompt) */
const HYBRID_REFERENCE_THRESHOLD = 0.35

/** Allowed URL prefixes for STEP file fetches (SSRF protection) */
const ALLOWED_STEP_URL_PREFIXES = [
  "https://", // Only HTTPS
]

/** Maximum STEP file size in bytes (50 MB) */
const MAX_STEP_FILE_SIZE = 50 * 1024 * 1024

/** Common words that add noise to keyword matching */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "at",
  "by", "with", "from", "is", "it", "as", "be", "this", "that", "are",
  "was", "were", "not", "but", "its", "has", "had", "have", "will",
  "can", "may", "mm", "cm", "kg", "type", "based", "standard", "main",
])

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Splits a string into lowercase word tokens, filtering out stop words.
 * Allows 2-char tokens for common engineering abbreviations (DC, IO, AC).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

/**
 * Extracts keyword tokens from a template's metadata fields, including tags.
 */
function templateKeywords(t: {
  name: string
  category: string
  subcategory: string | null
  description: string | null
  tags: string[] | null
}): string[] {
  const parts = [
    t.name,
    t.category,
    t.subcategory ?? "",
    t.description ?? "",
    ...(t.tags ?? []),
  ]
  return [...new Set(parts.flatMap(tokenize))]
}

/**
 * Strips characters that could be used for prompt injection from template metadata.
 * Allows only alphanumeric, spaces, hyphens, parentheses, slashes, and periods.
 *
 * @security Prevents indirect prompt injection when template fields are interpolated
 * into LLM prompts.
 */
export async function sanitiseForPrompt(text: string): Promise<string> {
  return text.replace(/[^\w\s\-()./:,]/g, "").slice(0, 200)
}

/**
 * Validates a URL is safe for server-side fetching.
 *
 * @security SSRF protection — only allows HTTPS URLs.
 * Rejects internal IPs, localhost, and non-HTTPS schemes.
 */
export async function isAllowedStepUrl(url: string): Promise<boolean> {
  if (!ALLOWED_STEP_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return false
  }
  try {
    const parsed = new URL(url)
    // Block internal/private hostnames
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.") ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// ─── Keyword Scoring ─────────────────────────────────────────────────

interface KeywordScoredTemplate {
  slug: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  stepUrl: string
  tags: string[] | null
  rawScore: number
}

/**
 * Scores templates by keyword overlap (original algorithm).
 */
async function scoreByKeywords(
  contextText: string,
  templates: {
    slug: string
    name: string
    category: string
    subcategory: string | null
    description: string | null
    tags: string[] | null
    step_url: string | null
  }[],
): Promise<KeywordScoredTemplate[]> {
  const contextLower = contextText.toLowerCase()
  const contextWords = tokenize(contextText)
  if (contextWords.length === 0) return []

  const scored: KeywordScoredTemplate[] = []

  for (const t of templates) {
    if (!t.step_url) continue
    if (!(await isAllowedStepUrl(t.step_url))) continue

    const keywords = templateKeywords({
      name: t.name,
      category: t.category,
      subcategory: t.subcategory ?? null,
      description: t.description ?? null,
      tags: Array.isArray(t.tags) ? t.tags : null,
    })
    if (keywords.length === 0) continue

    let rawScore = 0
    for (const kw of keywords) {
      if (contextLower.includes(kw)) rawScore += 2
      if (contextWords.some((w) =>
        w === kw ||
        (w.length >= 4 && w.startsWith(kw)) ||
        (w.length >= 4 && kw.startsWith(w))
      )) rawScore += 1
    }

    if (rawScore === 0) continue

    scored.push({
      slug: t.slug,
      name: t.name,
      category: t.category,
      subcategory: t.subcategory ?? null,
      description: t.description ?? null,
      stepUrl: t.step_url,
      tags: Array.isArray(t.tags) ? t.tags : null,
      rawScore,
    })
  }

  return scored
}

// ─── Semantic Scoring ────────────────────────────────────────────────

interface SemanticScoredTemplate {
  slug: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  stepUrl: string
  tags: string[] | null
  similarity: number
}

/**
 * Scores templates by semantic similarity via embedding + RPC.
 * Returns null if embedding is unavailable (graceful degradation).
 */
async function scoreBySemantics(
  moduleDescription: string,
): Promise<SemanticScoredTemplate[] | null> {
  const embedding = await embedText(moduleDescription)
  if (!embedding) return null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("match_step_templates", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: HYBRID_REFERENCE_THRESHOLD,
    match_count: 20,
  })

  if (error) {
    console.warn("[THE-FORGE] match_step_templates RPC error:", error.message)
    return null
  }

  if (!data || !Array.isArray(data)) return null

  return data
    .filter((r) => r.step_url)
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      category: r.category,
      subcategory: r.subcategory,
      description: r.description,
      stepUrl: r.step_url,
      tags: r.tags,
      similarity: r.similarity,
    }))
}

// ─── Main Matching Function ──────────────────────────────────────────

/**
 * Matches step_templates to a Build module using hybrid keyword + semantic scoring.
 *
 * @param moduleName - Module name (e.g. "Stepper Motor Mount")
 * @param modulePurpose - Module purpose sentence
 * @param keyParts - Array of key physical parts
 * @param moduleDescription - Optional full module description for semantic matching
 * @returns Top 3 matches + optional seed template + reference templates
 */
export async function matchTemplatesForModule(
  moduleName: string,
  modulePurpose: string,
  keyParts: string[],
  moduleDescription?: string,
): Promise<TemplateMatchResult> {
  const empty: TemplateMatchResult = { topMatches: [], seedTemplate: null, referenceTemplates: [] }

  // Build context string from module metadata
  const contextText = [moduleName, modulePurpose, ...keyParts].join(" ")
  if (!contextText.trim()) return empty

  // Fetch templates that have STEP geometry available
  const supabase = await createClient()
  const { data: templates, error } = await supabase
    .from("step_templates")
    .select("slug, name, category, subcategory, description, tags, step_url")
    .not("step_url", "is", null)
    .order("name")
    .limit(500)

  if (error) {
    console.error("[THE-FORGE] matchTemplatesForModule: DB error:", error.message)
    return empty
  }

  if (!templates || templates.length === 0) return empty

  // Run keyword scoring and semantic scoring in parallel
  const semanticQuery = moduleDescription || contextText
  const [keywordResults, semanticResults] = await Promise.all([
    scoreByKeywords(contextText, templates),
    scoreBySemantics(semanticQuery),
  ])

  // ── Fallback: pure keyword mode if semantic scoring is unavailable ──
  if (!semanticResults) {
    keywordResults.sort((a, b) => b.rawScore - a.rawScore)
    const topMatches = keywordResults.slice(0, 3).map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      subcategory: t.subcategory,
      description: t.description,
      stepUrl: t.stepUrl,
      score: t.rawScore,
      tags: t.tags,
    }))
    const best = topMatches[0] ?? null
    const seedTemplate = best && best.score >= SEED_THRESHOLD ? best : null
    return { topMatches, seedTemplate, referenceTemplates: [] }
  }

  // ── Hybrid mode: combine keyword + semantic scores ──

  // Normalise keyword scores to 0–1 range
  const maxKeywordScore = keywordResults.reduce((max, t) => Math.max(max, t.rawScore), 0)

  // Build lookup maps
  const keywordMap = new Map(keywordResults.map((t) => [t.slug, t]))
  const semanticMap = new Map(semanticResults.map((t) => [t.slug, t]))

  // Union all candidate slugs
  const allSlugs = new Set([...keywordMap.keys(), ...semanticMap.keys()])

  const hybridScored: TemplateMatch[] = []

  for (const slug of allSlugs) {
    const kw = keywordMap.get(slug)
    const sem = semanticMap.get(slug)

    const keywordNorm = kw && maxKeywordScore > 0 ? kw.rawScore / maxKeywordScore : 0
    const semanticScore = sem?.similarity ?? 0

    const hybridScore = keywordNorm * 0.4 + semanticScore * 0.6

    // Use whichever source has the metadata
    const source = kw ?? sem!

    hybridScored.push({
      slug: source.slug,
      name: source.name,
      category: source.category,
      subcategory: source.subcategory,
      description: source.description,
      stepUrl: source.stepUrl,
      score: Math.round(hybridScore * 1000) / 1000,
      tags: source.tags,
    })
  }

  hybridScored.sort((a, b) => b.score - a.score)

  const topMatches = hybridScored.slice(0, 3)
  const best = topMatches[0] ?? null
  const seedTemplate = best && best.score >= HYBRID_SEED_THRESHOLD ? best : null

  // Reference templates: above reference threshold but not the seed
  const referenceTemplates = hybridScored
    .filter((t) =>
      t.score >= HYBRID_REFERENCE_THRESHOLD &&
      t.score < HYBRID_SEED_THRESHOLD &&
      t.slug !== seedTemplate?.slug
    )
    .slice(0, 5)

  return { topMatches, seedTemplate, referenceTemplates }
}
