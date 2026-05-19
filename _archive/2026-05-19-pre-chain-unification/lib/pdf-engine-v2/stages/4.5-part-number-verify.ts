/**
 * @file stages/4.5-part-number-verify.ts
 *
 * Stage 4.5 — Part-number verification.
 *
 * After BoM emission + cost we walk every part on the design and try to
 * confirm the SKU actually exists. The cascade matches the target diagram
 * in engine-flow-2026-05-18.html §5 (P12a, gate G5):
 *
 *     Tier 1 — DigiKey API   (db-cache backed by character_registry)
 *     Tier 2 — Mouser API
 *     Tier 3 — Farnell / element14 API
 *     Tier 4 — Manufacturer-domain web search via Brave (Tavily fallback)
 *     If still no hit → mark verified=false with a reason.
 *
 * The renderer surfaces a small "?" badge next to part numbers that failed
 * verification (render-minimal-pdf.tsx already reads source_method; we
 * extend it to also read this stage's `verified` field).
 *
 * Design notes
 * ------------
 * • This stage REPLACES the older single-tier `lm-only` verifier path when
 *   wired in. It does NOT delete that file — the radical/part-verification.ts
 *   cascade has 5 tiers including the Gemini grounding pass; this stage is
 *   the leaner "just the deterministic API checks plus a web fallback" cut
 *   suitable for live pipeline runs where wall-clock budget matters.
 *
 * • Input expectations:
 *     - state.partVerifications: Array<PartVerification>
 *       (populated upstream from BoM lines or from retro-validation; if
 *       missing we derive on-the-fly from state.moduleDecomposition.modules
 *       via extractPartCandidates() so the stage is robust to either path).
 *
 * • Output:
 *     - state.partVerifications mutated in place. Each entry gains:
 *         verified: boolean
 *         verification_reason: string  (e.g. "Mouser SKU match" or
 *                                       "No hit on DigiKey, Mouser, Farnell,
 *                                        or Brave manufacturer-domain search")
 *         source_method: extended with 'brave-domain-search'
 *
 * Idempotent: re-running the stage on the same state is a no-op for any
 * entry that already has verified=true. Re-checks unverified entries.
 *
 * Cost
 * ----
 * Per-part cost: ~0 LLM tokens (the LLM tier was already paid upstream),
 * plus 3 distributor API calls (free) + at most 1 Brave search (£0.001).
 * 200-line BoM ≈ £0.20 per pipeline run. Cheap.
 *
 * Concurrency
 * -----------
 * Default 5-wide. Distributor APIs have their own rate limits; this matches
 * what the existing retro-validate cascade uses.
 */

import type { StageResult } from '../types'
import type { PartVerification } from '../radical/part-verification'
import {
  extractPartCandidates,
} from '../radical/part-verification'
import { findSkuForPart, type AggregateResult } from '../lib/distributors'
import { webSearch } from '../lib/search-client'
import { getActionLogger } from '../lib/action-logger'

const STAGE_NAME = '4.5-part-number-verify'
const DEFAULT_CONCURRENCY = 5

export interface PartVerifyResult {
  /** Total candidates considered (input length OR extracted from modules). */
  total: number
  /** Distinct candidates this stage attempted to verify (i.e. has a part_number). */
  attempted: number
  /** How many ended up verified=true. */
  verifiedCount: number
  /** Per-tier hit counts. */
  byTier: {
    digikey: number
    mouser: number
    farnell: number
    brave: number
    db_cache: number
    pre_existing: number
    none: number
  }
  /** Wall-clock for the stage in ms. */
  durationMs: number
  /** Mutated entries — same refs as state.partVerifications when input came from state. */
  verifications: VerifiedPartVerification[]
}

/** PartVerification extended with the deterministic boolean + reason. */
export type VerifiedPartVerification = PartVerification & {
  verified: boolean
  verification_reason: string
}

interface RunInput {
  partVerifications?: PartVerification[] | null
  moduleDecomposition?: {
    modules?: Array<{ module?: string; sub_modules?: unknown[] }>
  } | null
}

/**
 * Public entry point. Returns a StageResult<PartVerifyResult>.
 * Mutates state in place when given a partVerifications array.
 */
export async function runPartNumberVerify(
  state: RunInput,
  options: {
    concurrency?: number
    /** When true, re-check entries that already had verified=true. Defaults to false. */
    forceRecheck?: boolean
    /** Inject Brave/Tavily callback (test seam). Defaults to webSearch from search-client. */
    webSearchFn?: typeof webSearch
    /** Inject distributor lookup (test seam). Defaults to findSkuForPart. */
    findSkuFn?: typeof findSkuForPart
  } = {},
): Promise<StageResult<PartVerifyResult>> {
  const t0 = Date.now()
  const logger = getActionLogger()
  logger.logStage({
    step_name: STAGE_NAME,
    action_type: 'stage_start',
    input_count: Array.isArray(state.partVerifications)
      ? state.partVerifications.length
      : state.moduleDecomposition?.modules?.length ?? 0,
  })
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const forceRecheck = options.forceRecheck ?? false
  const webSearchFn = options.webSearchFn ?? webSearch
  const findSkuFn = options.findSkuFn ?? findSkuForPart

  // ─── Source the verification list ────────────────────────────────────────
  // Preferred: state.partVerifications populated upstream.
  // Fallback: derive PartCandidates from moduleDecomposition + synthesise the
  // base PartVerification shape so this stage runs even on cold state.
  let working: VerifiedPartVerification[] = []
  if (Array.isArray(state.partVerifications) && state.partVerifications.length > 0) {
    working = state.partVerifications.map((v) => {
      const ext = v as VerifiedPartVerification
      // Pre-existing verified=true from upstream tiers: respect it unless
      // forceRecheck. Skip entries with no part_number — nothing to verify.
      if (!ext.part_number) {
        return {
          ...ext,
          verified: ext.verified ?? false,
          verification_reason:
            ext.verification_reason ??
            'No part_number present; nothing to verify.',
        }
      }
      return {
        ...ext,
        verified: ext.verified ?? false,
        verification_reason: ext.verification_reason ?? '',
      }
    })
  } else if (state.moduleDecomposition?.modules) {
    const candidates = extractPartCandidates(
      state.moduleDecomposition.modules as unknown as Parameters<
        typeof extractPartCandidates
      >[0],
    )
    working = candidates.map((c) => ({
      ...c,
      status: 'uncertain' as const,
      confidence: 'low' as const,
      reasoning: 'No upstream verification — Stage 4.5 will attempt.',
      source_url: null,
      source_title: null,
      source_method: undefined,
      generated_by: 'stage-4.5',
      generated_at: new Date().toISOString(),
      verified: false,
      verification_reason: '',
    }))
  } else {
    logger.logStage({
      step_name: STAGE_NAME,
      action_type: 'stage_end',
      outcome: 'skipped',
      duration_ms: Date.now() - t0,
    })
    return {
      ok: true,
      data: {
        total: 0,
        attempted: 0,
        verifiedCount: 0,
        byTier: zeroByTier(),
        durationMs: Date.now() - t0,
        verifications: [],
      },
      durationMs: Date.now() - t0,
    }
  }

  const total = working.length

  // ─── Build the work list (skip pre-verified unless forced) ───────────────
  const todo: VerifiedPartVerification[] = []
  const byTier = zeroByTier()
  for (const v of working) {
    if (!v.part_number) continue
    if (v.verified && !forceRecheck) {
      byTier.pre_existing++
      continue
    }
    // db_cache already covered: an upstream tier wrote source_method='db-cache'.
    if (
      !forceRecheck &&
      (v.source_method === 'db-cache' ||
        v.source_method === 'mouser' ||
        v.source_method === 'digikey' ||
        v.source_method === 'farnell')
    ) {
      v.verified = true
      if (!v.verification_reason) {
        v.verification_reason = `Already verified upstream (${v.source_method}).`
      }
      byTier.pre_existing++
      continue
    }
    todo.push(v)
  }

  // ─── Run the cascade with bounded concurrency ────────────────────────────
  for (let i = 0; i < todo.length; i += concurrency) {
    const slice = todo.slice(i, i + concurrency)
    await Promise.all(
      slice.map(async (v) => {
        const verdict = await verifyOne(v, { findSkuFn, webSearchFn })
        v.verified = verdict.verified
        v.verification_reason = verdict.reason
        if (verdict.tier && verdict.tier !== 'none') {
          // Update source_method when a stronger tier confirmed the SKU.
          // We don't downgrade existing 'mouser'/'digikey'/'farnell' values.
          if (
            verdict.tier === 'brave' &&
            !['mouser', 'digikey', 'farnell', 'tavily'].includes(
              v.source_method ?? '',
            )
          ) {
            v.source_method = 'brave'
          } else if (
            verdict.tier === 'mouser' ||
            verdict.tier === 'digikey' ||
            verdict.tier === 'farnell'
          ) {
            v.source_method = verdict.tier
          }
          if (verdict.source_url && !v.source_url) v.source_url = verdict.source_url
          if (verdict.source_title && !v.source_title) v.source_title = verdict.source_title
        }
        byTier[verdict.tier]++
      }),
    )
  }

  // ─── Write back to state when caller passed a state.partVerifications ────
  if (Array.isArray(state.partVerifications)) {
    // Mutating the original array preserves any other consumer references.
    state.partVerifications.length = 0
    for (const v of working) state.partVerifications.push(v)
  }

  const verifiedCount = working.filter((v) => v.verified).length
  const durationMs = Date.now() - t0

  const verifiedPct = total > 0 ? Math.round((verifiedCount / total) * 100) : 0
  logger.logGate({
    step_name: STAGE_NAME,
    gate_name: 'G5_part_number_verify',
    verdict: verifiedPct >= 50 ? 'PASS' : 'WARN',
    score: verifiedPct,
    reasons: [
      `${verifiedCount}/${total} parts verified (${verifiedPct}%)`,
      `DigiKey: ${byTier.digikey}, Mouser: ${byTier.mouser}, Farnell: ${byTier.farnell}, Brave: ${byTier.brave}, pre-existing: ${byTier.pre_existing}, none: ${byTier.none}`,
    ],
    by_tier: byTier,
  })
  logger.logStage({
    step_name: STAGE_NAME,
    action_type: 'stage_end',
    outcome: 'ok',
    duration_ms: durationMs,
    total,
    attempted: todo.length,
    verified_count: verifiedCount,
  })
  return {
    ok: true,
    data: {
      total,
      attempted: todo.length,
      verifiedCount,
      byTier,
      durationMs,
      verifications: working,
    },
    durationMs,
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────

type Tier =
  | 'digikey'
  | 'mouser'
  | 'farnell'
  | 'brave'
  | 'db_cache'
  | 'pre_existing'
  | 'none'

function zeroByTier(): PartVerifyResult['byTier'] {
  return {
    digikey: 0,
    mouser: 0,
    farnell: 0,
    brave: 0,
    db_cache: 0,
    pre_existing: 0,
    none: 0,
  }
}

interface OneVerdict {
  verified: boolean
  tier: Tier
  reason: string
  source_url?: string | null
  source_title?: string | null
}

async function verifyOne(
  v: VerifiedPartVerification,
  deps: {
    findSkuFn: typeof findSkuForPart
    webSearchFn: typeof webSearch
  },
): Promise<OneVerdict> {
  const partNumber = (v.part_number ?? '').trim()
  if (!partNumber) {
    return { verified: false, tier: 'none', reason: 'No part_number to verify.' }
  }

  // ─── Tier 1-3 — distributor cascade (DigiKey / Mouser / Farnell + LCSC) ──
  // findSkuForPart parallelises and returns the cheapest in-stock distributor.
  // It already consults whatever db_cache layer the distributor modules use.
  // Pass manufacturer so the aggregator applies the manufacturer-strict filter.
  const manufacturer = (v.manufacturer ?? '').trim() || undefined
  let aggregate: AggregateResult | null = null
  try {
    aggregate = await deps.findSkuFn(partNumber, manufacturer)
  } catch {
    aggregate = null
  }
  if (aggregate?.best?.source) {
    const src = aggregate.best.source
    // Map distributor sources to the Tier counter buckets. LCSC + RS + Eriks +
    // Zoro are still real verifications — we bucket them under the closest
    // counter (mouser for stock distributors, brave for everything else).
    const tier: Tier =
      src === 'digikey'
        ? 'digikey'
        : src === 'mouser' || src === 'lcsc'
          ? 'mouser'
          : src === 'farnell'
            ? 'farnell'
            : 'brave'
    return {
      verified: true,
      tier,
      reason: `${src.toUpperCase()} SKU match (${aggregate.best.mpn ?? partNumber}).`,
      source_url: aggregate.best.productUrl ?? null,
      source_title: aggregate.best.description ?? null,
    }
  }

  // ─── Tier 4 — manufacturer-domain web search via Brave (Tavily fallback) ─
  const mfr = (v.manufacturer ?? '').trim()
  // Build a focused query: prefer a domain heuristic when the manufacturer
  // string looks like a real brand name. The search-client handles Tavily
  // primary + Brave fallback transparently.
  const query = mfr
    ? `${mfr} "${partNumber}" datasheet OR catalogue OR catalog`
    : `"${partNumber}" datasheet OR catalogue OR catalog`
  let braveHits: Awaited<ReturnType<typeof webSearch>> = []
  try {
    braveHits = await deps.webSearchFn({
      query,
      maxResults: 5,
      searchDepth: 'basic',
      timeoutMs: 12_000,
    })
  } catch {
    braveHits = []
  }

  // Accept ANY hit that contains the exact partNumber in title or URL or
  // snippet. We do NOT accept hits where the manufacturer's domain isn't
  // referenced when one was given; that filter is too aggressive (distributor
  // catalogues are usually the strongest verification signal and they're
  // not on the manufacturer's own domain).
  const needle = partNumber.toLowerCase()
  for (const h of braveHits) {
    const hay = `${h.title ?? ''} ${h.url ?? ''} ${h.snippet ?? ''}`.toLowerCase()
    if (hay.includes(needle)) {
      return {
        verified: true,
        tier: 'brave',
        reason: `Web search match (${h.source}): "${(h.title ?? '').slice(0, 80)}"`,
        source_url: h.url ?? null,
        source_title: h.title ?? null,
      }
    }
  }

  return {
    verified: false,
    tier: 'none',
    reason:
      'No hit on DigiKey, Mouser, Farnell, or manufacturer-domain web search. SKU may be fictional or proprietary.',
  }
}
