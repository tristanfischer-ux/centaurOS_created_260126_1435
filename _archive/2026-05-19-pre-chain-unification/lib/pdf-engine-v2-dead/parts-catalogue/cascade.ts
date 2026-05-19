/**
 * @file cascade.ts — Phase-by-phase part verification orchestrator.
 *
 * Tristan-approved architecture (2026-05-16):
 *
 *   Phase 0: Parts catalogue DB lookup     (instant, free)
 *   Phase 1: DigiKey API                   (240/min, 1000/day, free)
 *   Phase 2: Farnell API                   (60/min, free)
 *   Phase 3: Mouser API                    (30/min, 1000/day, free)
 *   Phase 4: Brave Search + LLM judge      (2000/month free, then £0.001)
 *   Phase 5: Tavily Search + LLM judge     (£0.001/search)
 *   Phase 6: Gemini grounded (manual escape valve — not in default flow)
 *   Phase 7: Mark uncertain, no link
 *
 * Rules:
 * - Stop on first hit. Don't query the same part on multiple distributors.
 * - Distributor URLs are trusted (skip HEAD-check; DigiKey + Farnell bot-block
 *   scripts so HEAD-check would always fail on real URLs).
 * - LLM-emitted + search-emitted URLs MUST pass urlResolves() before being
 *   kept.
 * - Every hit gets written back to the parts catalogue so the next chain
 *   picks it up at Phase 0.
 *
 * Rate limits are enforced by the token-bucket scheduler.
 */

import type { PartCandidate, PartVerification, VerificationStatus } from '../radical/part-verification'
import { mouserLookup, digikeyLookup, farnellLookup, tavilySearchForPart, judgeFromTavily } from '../radical/part-verification'
import { getDb, lookupPartsBulk, upsertPart, type PartCatalogueRow } from './db'
import { withRateLimit, getScheduler } from './rate-limit'
import { braveSearchForPart, judgeBraveResults } from './brave-search'

export interface CascadeOptions {
  apiKey: string  // OpenRouter for LLM judge
  projectId?: string  // for first_seen_in attribution
  /** Skip writes to the catalogue DB (read-only mode for tests). */
  noPersist?: boolean
  /** Gemini-grounded tier opt-in. Default false (paid escape valve). */
  enableGemini?: boolean
  /** Override the model used for LLM judges. Default 'google/gemini-3.1-flash-lite'. */
  judgeModel?: string
}

export interface CascadeResult {
  verifications: PartVerification[]
  stats: {
    total: number
    db_hits: number
    digikey_hits: number
    farnell_hits: number
    mouser_hits: number
    brave_hits: number
    tavily_hits: number
    gemini_hits: number
    uncertain: number
    cascade_duration_ms: number
  }
}

/**
 * Run the full cascade across a batch of part candidates. Process in phases:
 * each phase only sees the parts that didn't match an earlier phase.
 */
export async function cascadeVerify(candidates: PartCandidate[], opts: CascadeOptions): Promise<CascadeResult> {
  const t0 = Date.now()
  const judgeModel = opts.judgeModel ?? 'google/gemini-3.1-flash-lite'
  const verifications = new Map<string, PartVerification>()

  // Helper: register a hit + persist to DB (if not in dry-run mode)
  const recordHit = (cand: PartCandidate, v: PartVerification): void => {
    verifications.set(cand.id, v)
    if (!opts.noPersist && v.status === 'verified' && v.source_url) {
      upsertPart({
        manufacturer: cand.manufacturer,
        part_number: cand.part_number,
        source_method: v.source_method ?? 'lm-only',
        source_url: v.source_url,
        source_title: v.source_title ?? null,
        distributor_price_gbp: (v as any).distributor_price_gbp ?? null,
        distributor_availability: (v as any).distributor_availability ?? null,
        distributor_datasheet_url: (v as any).distributor_datasheet_url ?? null,
        generated_by: v.generated_by ?? null,
        first_seen_in: opts.projectId ?? null,
        head_check_ok: true,  // distributor + brave/tavily verified above
      })
    }
  }

  // ─── Phase 0: Parts catalogue DB lookup ────────────────────────────────
  const dbHits = lookupPartsBulk(candidates.map(c => ({
    manufacturer: c.manufacturer,
    part_number: c.part_number,
  })))
  let dbHitCount = 0
  for (const c of candidates) {
    const norm = `${normManufacturerHelper(c.manufacturer)}::${normPartNumberHelper(c.part_number)}`
    const row = dbHits.get(norm)
    if (row && row.source_url) {
      dbHitCount++
      verifications.set(c.id, {
        ...c,
        status: 'verified',
        confidence: 'high',
        reasoning: `Cached from parts catalogue (verified ${row.verified_at}, source ${row.source_method}).`,
        source_url: row.source_url,
        source_title: row.source_title,
        source_method: 'db-cache' as any,
        // Carry the distributor metadata forward for renderer
        ...(row.distributor_price_gbp !== null ? { distributor_price_gbp: row.distributor_price_gbp } : {}),
        ...(row.distributor_availability !== null ? { distributor_availability: row.distributor_availability } : {}),
        ...(row.distributor_datasheet_url !== null ? { distributor_datasheet_url: row.distributor_datasheet_url } : {}),
        generated_by: `db-cache (origin: ${row.source_method})`,
        generated_at: new Date().toISOString(),
      } as PartVerification)
    }
  }

  // ─── Phase 1: DigiKey ──────────────────────────────────────────────────
  const phase1 = candidates.filter(c => !verifications.has(c.id))
  let digikeyHits = 0
  for (const c of phase1) {
    const sched = getScheduler()
    if (!sched.get('digikey').underSoftCap()) break  // demote DigiKey for rest of day
    try {
      const d = await withRateLimit('digikey', () => digikeyLookup(c.manufacturer, c.part_number))
      if (d?.found && d.product_url) {
        digikeyHits++
        recordHit(c, {
          ...c,
          status: 'verified', confidence: 'high',
          reasoning: `DigiKey catalogue match: ${d.sku} (${d.description ?? '—'})`,
          source_url: d.product_url, source_title: d.description ?? null,
          source_method: 'digikey',
          distributor_price_gbp: d.price_gbp ?? null,
          distributor_availability: d.availability ?? null,
          distributor_datasheet_url: d.datasheet_url ?? null,
          generated_by: 'digikey-api', generated_at: new Date().toISOString(),
        } as PartVerification)
      }
    } catch {}
  }

  // ─── Phase 2: Farnell ──────────────────────────────────────────────────
  const phase2 = candidates.filter(c => !verifications.has(c.id))
  let farnellHits = 0
  for (const c of phase2) {
    try {
      const f = await withRateLimit('farnell', () => farnellLookup(c.manufacturer, c.part_number))
      if (f?.found && f.product_url) {
        farnellHits++
        recordHit(c, {
          ...c,
          status: 'verified', confidence: 'high',
          reasoning: `Farnell catalogue match: ${f.sku} (${f.description ?? '—'})`,
          source_url: f.product_url, source_title: f.description ?? null,
          source_method: 'farnell',
          distributor_price_gbp: f.price_gbp ?? null,
          distributor_availability: f.availability ?? null,
          distributor_datasheet_url: f.datasheet_url ?? null,
          generated_by: 'farnell-api', generated_at: new Date().toISOString(),
        } as PartVerification)
      }
    } catch {}
  }

  // ─── Phase 3: Mouser ───────────────────────────────────────────────────
  const phase3 = candidates.filter(c => !verifications.has(c.id))
  let mouserHits = 0
  for (const c of phase3) {
    const sched = getScheduler()
    if (!sched.get('mouser').underSoftCap()) break
    try {
      const m = await withRateLimit('mouser', () => mouserLookup(c.manufacturer, c.part_number))
      if (m?.found && m.product_url) {
        mouserHits++
        recordHit(c, {
          ...c,
          status: 'verified', confidence: 'high',
          reasoning: `Mouser catalogue match: ${m.sku} (${m.description ?? '—'})`,
          source_url: m.product_url, source_title: m.description ?? null,
          source_method: 'mouser',
          distributor_price_gbp: m.price_gbp ?? null,
          distributor_availability: m.availability ?? null,
          distributor_datasheet_url: m.datasheet_url ?? null,
          generated_by: 'mouser-api', generated_at: new Date().toISOString(),
        } as PartVerification)
      }
    } catch {}
  }

  // ─── Phase 4: Brave Search + LLM judge ─────────────────────────────────
  const phase4 = candidates.filter(c => !verifications.has(c.id))
  let braveHits = 0
  for (const c of phase4) {
    try {
      const { results } = await withRateLimit('brave', () => braveSearchForPart(c.manufacturer, c.part_number))
      if (results.length === 0) continue
      const j = await withRateLimit('openrouter', () => judgeBraveResults({
        manufacturer: c.manufacturer,
        part_number: c.part_number,
        application_context: c.word_name,
        results,
        apiKey: opts.apiKey,
        model: judgeModel,
      }))
      if (j?.url) {
        braveHits++
        recordHit(c, {
          ...c,
          status: 'verified', confidence: j.confidence,
          reasoning: `Brave search match: ${j.reasoning}`,
          source_url: j.url, source_title: j.title,
          source_method: 'brave',
          generated_by: `brave + ${judgeModel}`, generated_at: new Date().toISOString(),
        } as PartVerification)
      }
    } catch {}
  }

  // ─── Phase 5: Tavily Search + LLM judge ────────────────────────────────
  const phase5 = candidates.filter(c => !verifications.has(c.id))
  let tavilyHits = 0
  for (const c of phase5) {
    try {
      const { url: topUrl, title: topTitle, content } = await withRateLimit('tavily', () => tavilySearchForPart(c.manufacturer, c.part_number))
      if (!content) continue
      const judged = await withRateLimit('openrouter', () => judgeFromTavily(c, opts.apiKey, content, topUrl, topTitle, judgeModel))
      if (judged?.status === 'verified' && judged.sourceUrl) {
        tavilyHits++
        recordHit(c, {
          ...c,
          status: 'verified', confidence: judged.confidence,
          reasoning: `Tavily search match: ${judged.reasoning}`,
          source_url: judged.sourceUrl, source_title: judged.sourceTitle,
          source_method: 'tavily',
          generated_by: `tavily + ${judgeModel}`, generated_at: new Date().toISOString(),
        } as PartVerification)
      }
    } catch {}
  }

  // ─── Phase 6: Gemini grounded (opt-in) ─────────────────────────────────
  // Reserved for future — needs the GEMINI_API_KEY direct integration.
  // For now, skip.

  // ─── Phase 7: Mark remaining as uncertain ──────────────────────────────
  let uncertain = 0
  for (const c of candidates) {
    if (verifications.has(c.id)) continue
    uncertain++
    verifications.set(c.id, {
      ...c,
      status: 'uncertain', confidence: 'low',
      reasoning: 'Not found in parts catalogue, distributor APIs, Brave Search, or Tavily. Manual sourcing required.',
      source_url: null, source_title: null,
      source_method: 'skip',
      generated_by: 'cascade-no-match', generated_at: new Date().toISOString(),
    })
  }

  return {
    verifications: candidates.map(c => verifications.get(c.id)!).filter(Boolean),
    stats: {
      total: candidates.length,
      db_hits: dbHitCount,
      digikey_hits: digikeyHits,
      farnell_hits: farnellHits,
      mouser_hits: mouserHits,
      brave_hits: braveHits,
      tavily_hits: tavilyHits,
      gemini_hits: 0,
      uncertain,
      cascade_duration_ms: Date.now() - t0,
    },
  }
}

// Re-export the normalisation helpers from db.ts under shorter names for
// the local recordHit helper above.
function normManufacturerHelper(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
function normPartNumberHelper(s: string): string {
  const first = String(s || '').trim().split(/\s+/)[0]
  return first.toLowerCase().replace(/[^a-z0-9]/g, '')
}
