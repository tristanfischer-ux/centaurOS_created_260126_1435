/**
 * @file foundry-context.ts — Foundry profile canonicalisation + hashing.
 *
 * @description The why-fit + how-to-pitch + drafted-email generator caches its
 * output per (foundry, investor, founder-context) triple. The third leg is a
 * deterministic hash of the founder's profile fields used in the prompt. When
 * any of those fields change, the hash changes and the cache misses, forcing
 * a regeneration. When nothing meaningful changes, the cache hits and saves
 * the LLM round-trip (~10p per result at Sonnet pricing — the £10/100 add-on
 * margin depends on this hit-rate).
 *
 * Pure functions only. No DB calls, no side effects, no `"use server"`.
 *
 * @audit Phase G post-pivot rebuild, 2026-04-25.
 */

import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical, prompt-ready snapshot of a founder/foundry profile.
 *
 * Every field is optional. The hash is computed across whichever fields are
 * present, so a partial profile still hashes cleanly — just to a different
 * key than a fuller profile, which is what we want (the LLM output WILL be
 * different when more context is available, so it should miss the cache).
 */
export interface FoundryContextInput {
  industry?: string | null
  subIndustry?: string | null
  stage?: string | null
  tractionSummary?: string | null
  teamSize?: number | null
  teamSummary?: string | null
  ipStatus?: string | null
  capTableSummary?: string | null
  region?: string | null
  regulatoryContext?: string | null
}

export interface FoundryContext {
  /** Canonical newline-delimited "key: value" string used in the LLM prompt. */
  contextString: string
  /** sha256 hex digest of `contextString`. Used as the cache key. */
  contextHash: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise whitespace + lowercase the trimmed value. Returns null for empty
 * strings so they don't contribute to the hash.
 */
function normalise(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).replace(/\s+/g, ' ').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Sorted-key serialisation. The order is FIXED so any caller passing the same
 * fields in any order produces the same hash.
 */
const FIELD_ORDER: Array<keyof FoundryContextInput> = [
  'industry',
  'subIndustry',
  'stage',
  'tractionSummary',
  'teamSize',
  'teamSummary',
  'ipStatus',
  'capTableSummary',
  'region',
  'regulatoryContext',
]

const FIELD_LABELS: Record<keyof FoundryContextInput, string> = {
  industry: 'Industry',
  subIndustry: 'Sub-industry',
  stage: 'Stage',
  tractionSummary: 'Traction',
  teamSize: 'Team size',
  teamSummary: 'Team',
  ipStatus: 'IP status',
  capTableSummary: 'Cap table',
  region: 'Region',
  regulatoryContext: 'Regulatory context',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the canonical context string + sha256 hash from a founder profile.
 *
 * @description The string is what gets embedded in the LLM prompt. The hash is
 * what gets stored on the cache row. Two different callers with the same
 * meaningful profile will produce the same hash regardless of input order.
 *
 * Empty/null fields are skipped — they don't contribute to either output. This
 * means a founder who later adds an `ipStatus` will see fresh generations
 * (cache miss on the new hash) without re-hashing the rest of their profile.
 *
 * @param input - Foundry profile fields. Any can be omitted.
 * @returns Canonical context string + its sha256 hex digest.
 */
export function buildFoundryContext(input: FoundryContextInput): FoundryContext {
  const lines: string[] = []
  for (const key of FIELD_ORDER) {
    const raw = input[key]
    if (raw == null) continue
    if (typeof raw === 'number') {
      lines.push(`${FIELD_LABELS[key]}: ${raw}`)
      continue
    }
    const normalised = normalise(raw)
    if (normalised) {
      lines.push(`${FIELD_LABELS[key]}: ${normalised}`)
    }
  }
  // GOTCHA: Even an empty profile still produces a deterministic hash so the
  // cache key is never undefined — anonymous-like flows hit the same key.
  const contextString = lines.length > 0 ? lines.join('\n') : '<empty-foundry-context>'
  const contextHash = createHash('sha256').update(contextString).digest('hex')
  return { contextString, contextHash }
}

/**
 * Produce a short, human-readable summary line for logs / debug UI.
 *
 * @example
 * "food-tech / Pre-Seed / 5 people / £400K pre-orders"
 */
export function summariseFoundryContext(input: FoundryContextInput): string {
  const parts: string[] = []
  if (input.subIndustry || input.industry) {
    parts.push(normalise(input.subIndustry) ?? normalise(input.industry) ?? '')
  }
  if (input.stage) parts.push(normalise(input.stage) ?? '')
  if (input.teamSize != null) parts.push(`${input.teamSize} people`)
  if (input.tractionSummary) {
    const t = normalise(input.tractionSummary)
    if (t) parts.push(t.length > 50 ? `${t.slice(0, 47)}…` : t)
  }
  return parts.filter(Boolean).join(' / ') || 'profile incomplete'
}
