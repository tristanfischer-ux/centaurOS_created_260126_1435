'use server'

/**
 * Money Thesis server actions — investor_thesis versioning + active pointer.
 *
 * Per MONEY-SCHEMA §1 ambiguity #4: thesis is versioned, never updated in
 * place. Each save inserts a new row with version = max+1; the foundry's
 * `active_thesis_id` pointer is updated to the new row. Old versions stay
 * readable for history; archived_at flag is the soft-delete.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'
import { recordSpecialistCall } from '@/lib/audit/specialist-call'
import type { ExtractedThesis } from '@/lib/money/match-types'

export type ThesisWeights = {
  thesis: number
  stage: number
  cheque: number
  warm: number
  geo: number
  recency: number
  speed: number
}

export type ThesisRow = {
  id: string
  version: number
  stage_tags: string[]
  sector_tags: string[]
  geography: string[]
  cheque_min_cents: number | null
  cheque_max_cents: number | null
  keywords: string[]
  preferred_instrument: string[]
  decision_speed_max_weeks: number | null
  lead_follower_pref: string
  no_go_rules: unknown
  weights: ThesisWeights
  data_sources: unknown
  created_at: string
  is_active: boolean
}

export type ThesisInput = {
  stage_tags: string[]
  sector_tags: string[]
  geography?: string[]
  cheque_min_cents?: number | null
  cheque_max_cents?: number | null
  keywords?: string[]
  preferred_instrument?: string[]
  decision_speed_max_weeks?: number | null
  lead_follower_pref?: string
  weights?: Partial<ThesisWeights>
}

const DEFAULT_WEIGHTS: ThesisWeights = {
  thesis: 35,
  stage: 20,
  cheque: 15,
  warm: 12,
  geo: 8,
  recency: 6,
  speed: 4,
}

function isWeights(v: unknown): v is ThesisWeights {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.thesis === 'number' &&
    typeof o.stage === 'number' &&
    typeof o.cheque === 'number'
  )
}

export async function getActiveThesis(): Promise<
  { thesis: ThesisRow | null; versions: Array<{ id: string; version: number; created_at: string }> } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: foundry } = await supabase
      .from('foundries')
      .select('active_thesis_id')
      .eq('id', foundryId)
      .maybeSingle()

    const activeId = foundry?.active_thesis_id ?? null

    const { data: allRows } = await supabase
      .from('investor_thesis')
      .select(
        'id, version, stage_tags, sector_tags, geography, cheque_min_cents, cheque_max_cents, keywords, preferred_instrument, decision_speed_max_weeks, lead_follower_pref, no_go_rules, weights, data_sources, created_at',
      )
      .eq('foundry_id', foundryId)
      .is('archived_at', null)
      .order('version', { ascending: false })

    const rows = allRows ?? []
    const versions = rows.map((r) => ({
      id: r.id,
      version: r.version,
      created_at: r.created_at,
    }))

    const active = activeId ? rows.find((r) => r.id === activeId) ?? null : rows[0] ?? null
    if (!active) return { thesis: null, versions }

    const thesis: ThesisRow = {
      id: active.id,
      version: active.version,
      stage_tags: active.stage_tags ?? [],
      sector_tags: active.sector_tags ?? [],
      geography: active.geography ?? [],
      cheque_min_cents: active.cheque_min_cents,
      cheque_max_cents: active.cheque_max_cents,
      keywords: active.keywords ?? [],
      preferred_instrument: active.preferred_instrument ?? [],
      decision_speed_max_weeks: active.decision_speed_max_weeks,
      lead_follower_pref: active.lead_follower_pref ?? 'either',
      no_go_rules: active.no_go_rules,
      weights: isWeights(active.weights) ? active.weights : DEFAULT_WEIGHTS,
      data_sources: active.data_sources,
      created_at: active.created_at,
      is_active: active.id === activeId,
    }
    return { thesis, versions }
  })
}

export async function saveThesisVersion(
  input: ThesisInput,
): Promise<{ id: string; version: number } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    if (!input.stage_tags?.length) return { error: 'At least one stage tag is required' }
    if (!input.sector_tags?.length) return { error: 'At least one sector tag is required' }

    // Determine next version number for this foundry.
    const { data: existing } = await supabase
      .from('investor_thesis')
      .select('version')
      .eq('foundry_id', foundryId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (existing?.version ?? 0) + 1

    const weights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) }
    const sumWeights =
      weights.thesis + weights.stage + weights.cheque + weights.warm + weights.geo + weights.recency + weights.speed
    if (sumWeights !== 100) {
      return { error: `Weights must sum to 100 (got ${sumWeights})` }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('investor_thesis')
      .insert({
        foundry_id: foundryId,
        version: nextVersion,
        stage_tags: input.stage_tags,
        sector_tags: input.sector_tags,
        geography: input.geography ?? [],
        cheque_min_cents: input.cheque_min_cents ?? null,
        cheque_max_cents: input.cheque_max_cents ?? null,
        keywords: input.keywords ?? [],
        preferred_instrument: input.preferred_instrument ?? [],
        decision_speed_max_weeks: input.decision_speed_max_weeks ?? null,
        lead_follower_pref: input.lead_follower_pref ?? 'either',
        weights: weights as unknown as Record<string, number>,
        created_by: user.id,
      })
      .select('id, version')
      .single()

    if (insertErr || !inserted) {
      return { error: insertErr?.message ?? 'Insert failed' }
    }

    // Promote to active.
    const { error: updateErr } = await supabase
      .from('foundries')
      .update({ active_thesis_id: inserted.id })
      .eq('id', foundryId)

    if (updateErr) return { error: updateErr.message }

    revalidatePath('/money/raise')
    revalidatePath('/money/raise/thesis')
    return { id: inserted.id, version: inserted.version }
  })
}

// ============================================================================
// Business-plan → thesis extraction
// ============================================================================

const THESIS_EXTRACTION_MODEL = 'gpt-5.5'
const THESIS_EXTRACTION_MAX_TOKENS = 2048
const THESIS_EXTRACTION_MAX_CHARS = 20_000

const THESIS_EXTRACTION_SYSTEM_PROMPT = `You are an expert fundraising advisor. A founder has given you their business plan. Extract a structured investor-targeting thesis so we can match them to the right investors.

Return ONLY a raw JSON object (no markdown, no code fences) with these fields:
- stage_tags: array of funding stages the company is raising for. Use slugs from this list only: "pre_seed", "seed", "series_a", "series_b", "growth", "late_stage". Empty array if unclear.
- sector_tags: array of 1-6 sector/industry labels the business sits in (e.g. ["climate", "hardware", "robotics"]). Lowercase, single-word or short-phrase.
- geography: array of ISO-2 country codes where the company operates or wants investors (e.g. ["GB", "US"]). Empty array if none mentioned.
- cheque_min_cents: minimum cheque size wanted, in GBP pence (integer). null if unknown.
- cheque_max_cents: maximum cheque size wanted, in GBP pence (integer). null if unknown.
- instrument: one of "SAFE", "priced_equity", "convertible_note", "revenue_based", "grant", or null if unclear.
- keywords: 4-10 distinctive keywords that would light up in an investor's thesis or portfolio description (e.g. ["carbon capture", "precision agriculture", "DTC skincare"]). Lowercase.
- summary: 1-2 plain-English sentences describing the business and what it raises for. British spelling.

Be conservative: if the plan doesn't give signal on a field, leave it empty / null. Do not invent.`

function safeParseExtractedThesis(raw: string): ExtractedThesis | null {
  const trimmed = raw.trim()
  const fenceStripped = (() => {
    const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
    return m ? m[1].trim() : trimmed
  })()
  const candidates: string[] = [fenceStripped]
  const braceMatch = fenceStripped.match(/\{[\s\S]*\}/)
  if (braceMatch && braceMatch[0] !== fenceStripped) candidates.push(braceMatch[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const asStrArr = (v: unknown, upper = false): string[] =>
        Array.isArray(v)
          ? v
              .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
              .map((x) => (upper ? x.trim().toUpperCase() : x.trim().toLowerCase()))
          : []
      const asIntOrNull = (v: unknown): number | null => {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
        if (typeof v === 'string') {
          const n = Number(v.replace(/[^0-9.]/g, ''))
          return Number.isFinite(n) ? Math.round(n) : null
        }
        return null
      }
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
      if (!summary) continue
      return {
        stage_tags: asStrArr(parsed.stage_tags).map((s) => s.replace(/[-\s]+/g, '_')),
        sector_tags: asStrArr(parsed.sector_tags),
        geography: asStrArr(parsed.geography, true),
        cheque_min_cents: asIntOrNull(parsed.cheque_min_cents),
        cheque_max_cents: asIntOrNull(parsed.cheque_max_cents),
        instrument: typeof parsed.instrument === 'string' ? parsed.instrument : null,
        keywords: asStrArr(parsed.keywords),
        summary,
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * Parse a raw business-plan text blob into a structured thesis. Uses OpenAI
 * via callOpenAI and records the LLM call to the shared specialist
 * audit log so it shows up in the Money credits ledger. Never throws — callers
 * receive a tagged error string on any failure.
 */
export async function extractThesisFromBusinessPlan(args: {
  text: string
}): Promise<{ error: string } | { success: true; extracted: ExtractedThesis }> {
  return withAuth(async ({ user, foundryId }) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return { error: 'ai_not_configured' }

    const raw = (args.text ?? '').trim()
    if (raw.length < 50) return { error: 'text_too_short' }

    const planText = raw.slice(0, THESIS_EXTRACTION_MAX_CHARS)

    try {
      const { callOpenAI } = await import('@/lib/cad-lab/api-helpers')

      const startedAt = Date.now()
      const result = await callOpenAI(
        THESIS_EXTRACTION_SYSTEM_PROMPT,
        `Here is the business plan:\n\n${planText}\n\nReturn the JSON object only.`,
        THESIS_EXTRACTION_MODEL,
        THESIS_EXTRACTION_MAX_TOKENS,
        120_000,
      )

      // Log the call to the shared specialist audit log (hooks into the
      // ai_credits_ledger trigger). Fiona owns fundraising.
      void recordSpecialistCall({
        foundryId,
        specialistId: 'fundraising-advisor',
        section: 'money',
        model: 'opus',
        inputTokens: result.tokensIn,
        outputTokens: result.tokensOut,
        durationMs: Date.now() - startedAt,
        invokedByUserId: user.id,
        entityId: 'thesis_extraction',
      })

      if (!result.text) return { error: 'extraction_failed' }

      const extracted = safeParseExtractedThesis(result.text)
      if (!extracted) return { error: 'extraction_failed' }

      return { success: true as const, extracted }
    } catch (err) {
      console.error('[extractThesisFromBusinessPlan] OpenAI call failed:', err)
      return { error: 'extraction_failed' }
    }
  })
}

/**
 * Persist an `ExtractedThesis` as the next `investor_thesis` version and
 * promote it to active. Writes provenance (source + extracted_at) into the
 * row's `data_sources` field.
 *
 * Does NOT call `saveThesisVersion` directly because the latter enforces
 * non-empty stage_tags + sector_tags — an extracted thesis may legitimately
 * come back with empty arrays and we don't want to force the founder to
 * hand-correct before saving the draft.
 */
export async function saveExtractedThesis(args: {
  extracted: ExtractedThesis
  source: 'business_plan' | 'manual'
}): Promise<{ error: string } | { success: true; thesis_id: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    const { extracted, source } = args

    if (!extracted.stage_tags.length && !extracted.sector_tags.length) {
      return { error: 'thesis_empty' }
    }

    const { data: existing } = await supabase
      .from('investor_thesis')
      .select('version')
      .eq('foundry_id', foundryId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextVersion = (existing?.version ?? 0) + 1

    // Default weights — sum to 100, matches money-thesis.ts DEFAULT_WEIGHTS shape.
    const weights = {
      thesis: 35,
      stage: 20,
      cheque: 15,
      warm: 12,
      geo: 8,
      recency: 6,
      speed: 4,
    }

    const dataSources: Record<string, string> = {
      source,
      extracted_at: new Date().toISOString(),
      extracted_by: user.id,
      summary: extracted.summary,
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('investor_thesis')
      .insert({
        foundry_id: foundryId,
        version: nextVersion,
        stage_tags: extracted.stage_tags,
        sector_tags: extracted.sector_tags,
        geography: extracted.geography,
        cheque_min_cents: extracted.cheque_min_cents,
        cheque_max_cents: extracted.cheque_max_cents,
        keywords: extracted.keywords,
        preferred_instrument: extracted.instrument ? [extracted.instrument] : [],
        lead_follower_pref: 'either',
        weights: weights as unknown as Record<string, number>,
        data_sources: dataSources,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return { error: insertErr?.message ?? 'Insert failed' }
    }

    const { error: promoteErr } = await supabase
      .from('foundries')
      .update({ active_thesis_id: inserted.id })
      .eq('id', foundryId)
    if (promoteErr) return { error: promoteErr.message }

    revalidatePath('/money/raise')
    revalidatePath('/money/raise/thesis')
    return { success: true as const, thesis_id: inserted.id }
  })
}
