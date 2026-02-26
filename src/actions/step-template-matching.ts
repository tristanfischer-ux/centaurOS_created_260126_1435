"use server"

/**
 * @file step-template-matching.ts — Keyword-based matching of step_templates to Build modules.
 *
 * @description Follows the scoring pattern from reference-models.ts:
 * tokenize the module context (name + purpose + keyParts), then score each
 * template's name/category/subcategory/description/tags by keyword overlap.
 *
 * Uses RAW scores (not normalised) — same as reference-models.ts — so templates
 * with richer metadata that match more keywords rank higher, not lower.
 *
 * Strong matches (rawScore >= SEED_THRESHOLD) are eligible for seed-geometry routing,
 * where the template's actual STEP file is used as a starting point for
 * code generation via the /mashup Modal endpoint.
 *
 * @security Server-side only. Reads from step_templates (public read).
 * Template metadata is sanitised before prompt injection (see sanitiseForPrompt).
 */

import { createClient } from "@/lib/supabase/server"

// ─── Types ───────────────────────────────────────────────────────────

export interface TemplateMatch {
  slug: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  stepUrl: string
  /** Raw keyword match score (higher = more keyword overlap) */
  score: number
}

export interface TemplateMatchResult {
  /** Top 3 matches by score (may be empty) */
  topMatches: TemplateMatch[]
  /** Best match if score >= SEED_THRESHOLD, otherwise null */
  seedTemplate: TemplateMatch | null
}

// ─── Constants ───────────────────────────────────────────────────────

/**
 * Minimum raw keyword score for a template to be used as seed geometry.
 * A score of 6 means at least 2 keywords matched with full substring + word hits,
 * which indicates strong relevance.
 *
 * DECISION: Using raw scores (like reference-models.ts) instead of normalised.
 * Normalised scores penalise templates with richer metadata — a template with
 * 50 keywords and 10 matches (normalised 0.2) would lose to one with 1 keyword
 * and 1 match (normalised 1.0).
 */
const SEED_THRESHOLD = 6

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

// ─── Main Matching Function ──────────────────────────────────────────

/**
 * Matches step_templates to a Build module by keyword scoring.
 *
 * @param moduleName - Module name (e.g. "Stepper Motor Mount")
 * @param modulePurpose - Module purpose sentence
 * @param keyParts - Array of key physical parts
 * @returns Top 3 matches + optional seed template
 */
export async function matchTemplatesForModule(
  moduleName: string,
  modulePurpose: string,
  keyParts: string[],
): Promise<TemplateMatchResult> {
  const empty: TemplateMatchResult = { topMatches: [], seedTemplate: null }

  // Build context string from module metadata
  const contextText = [moduleName, modulePurpose, ...keyParts].join(" ")
  if (!contextText.trim()) return empty

  const contextLower = contextText.toLowerCase()
  const contextWords = tokenize(contextText)
  if (contextWords.length === 0) return empty

  // Fetch templates that have STEP geometry available (including tags for scoring)
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

  // Score each template using the reference-models keyword pattern (raw scores)
  const scored: TemplateMatch[] = []

  for (const t of templates) {
    // Runtime guard for nullable step_url (belt + suspenders with the DB filter)
    if (!t.step_url) continue

    // SECURITY: Validate URL before including in results
    if (!(await isAllowedStepUrl(t.step_url))) continue

    const keywords = templateKeywords({
      name: t.name,
      category: t.category,
      subcategory: t.subcategory ?? null,
      description: t.description ?? null,
      tags: Array.isArray(t.tags) ? t.tags as string[] : null,
    })
    if (keywords.length === 0) continue

    let rawScore = 0
    for (const kw of keywords) {
      // +2 for full substring match in context
      if (contextLower.includes(kw)) rawScore += 2
      // +1 for word-level exact or prefix match
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
      score: rawScore,
    })
  }

  // Sort descending by raw score (like reference-models.ts), take top 3
  scored.sort((a, b) => b.score - a.score)
  const topMatches = scored.slice(0, 3)
  const best = topMatches[0] ?? null
  const seedTemplate = best && best.score >= SEED_THRESHOLD ? best : null

  return { topMatches, seedTemplate }
}

