#!/usr/bin/env npx tsx
/**
 * scripts/cost-repair.tsx
 *
 * Sprint 1B (Tristan 2026-05-20): Cost Repair Loop.
 *
 * Engine C flags each priced BoM line as `in_range` / `over` / `under` /
 * `no_reference` against the Phase 4 corpus, but does NOT correct. A row
 * flagged `<.5x` (e.g. £112.50 for a £3-8k 40-ft ISO container) ships to
 * the PDF unchanged. This script closes that loop:
 *
 *   1. Reads partVerifications, filters to rows with engine_c_flag in
 *      ['over','under'].
 *   2. Batch-asks a fixer model (Grok 4.3 by default — no Anthropic in
 *      production per MEMORY directive) to decide per row:
 *        a) "corrected"               — provide a better price + cited
 *                                       distributor/manufacturer URL
 *        b) "manual_sourcing_required"— current price + corpus median both
 *                                       wrong; flag for human procurement
 *        c) "leave_as_is"             — current price actually correct, the
 *                                       corpus comparison is misleading
 *   3. Persists the verdict + (when corrected) the new unit price back
 *      into partVerifications as new fields:
 *        cost_repair_action, cost_repair_reasoning, cost_repair_source,
 *        cost_repair_confidence, cost_repair_corrected_price_gbp,
 *        cost_repair_excluded_from_subtotal
 *
 * UNIVERSAL — runs against every product class. Reads engine_c_flag /
 * engine_b_component_class / etc., applies the same logic regardless of
 * whether the brief is for a vertical farm, BESS rack, heat pump, etc.
 *
 * Usage:
 *   npx tsx scripts/cost-repair.tsx <state.json> [--write]
 *
 * Wired into scripts/serial-design-chain-v2.tsx AFTER Engine C, BEFORE
 * Engine D (so suppliers see corrected prices).
 *
 * Skipped via CHAIN_SKIP_COST_REPAIR=1 environment variable.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_KEY
const FIXER_MODEL = process.env.COST_REPAIR_MODEL || 'x-ai/grok-4.3'
const MAX_PARTS_PER_BATCH = 60
const MAX_TOKENS = 16384

interface FlaggedRow {
  word_id: string
  word_name: string
  manufacturer: string | null
  part_number: string | null
  quantity: number
  current_unit_price_gbp: number
  engine_b_component_class: string
  engine_c_flag: 'over' | 'under'
  engine_c_ref_median_gbp: number | null
  engine_c_ratio: number | null
}

interface RepairResponse {
  word_id: string
  action: 'corrected' | 'manual_sourcing_required' | 'leave_as_is'
  corrected_unit_price_gbp?: number
  source?: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

function buildPrompt(rows: FlaggedRow[]): string {
  return `You are an industrial-parts pricing reviewer. The design chain has produced a unit price for each part below, but the corpus-comparison check (Engine C) has flagged each as out of typical range. For each row, decide ONE of three actions:

A) "corrected" — you have high confidence the current price is wrong. Provide a corrected unit price + cite a real distributor or manufacturer URL. Use realistic UK GBP prices.
B) "manual_sourcing_required" — both the current price AND the corpus median look implausible; flag for human procurement.
C) "leave_as_is" — the current price is actually correct; the corpus comparison is misleading (corpus median came from incompatible items, e.g. small consumer parts compared against industrial commodity).

For commodities sold at retail catalogue (ISO containers, off-the-shelf compressors, finished pumps, structural beams, OEM-branded modules): prefer "corrected" with a realistic UK price citing CIMC / Copeland / Bosch Rexroth / Grundfos / etc.

For custom-fabricated items (brackets, sheet-metal enclosures, machined parts): if the current price is below £20/unit at 1000-unit production volume, "manual_sourcing_required". If plausible, "leave_as_is".

Reply with a JSON array — one object per row, in the same order. Schema:
{ "word_id": str, "action": "corrected"|"manual_sourcing_required"|"leave_as_is", "corrected_unit_price_gbp"?: number, "source"?: str, "confidence": "high"|"medium"|"low", "reasoning": str }

PARTS:
${JSON.stringify(rows, null, 2)}

Return ONLY the JSON array. No markdown, no prose.`
}

async function callFixer(rows: FlaggedRow[]): Promise<RepairResponse[]> {
  if (!OPENROUTER_KEY) {
    console.error('[cost-repair] OPENROUTER_API_KEY missing; skipping')
    return []
  }
  const prompt = buildPrompt(rows)
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://fractionalforge.com',
      'X-Title': 'ForgeOS Cost Repair Loop',
    },
    body: JSON.stringify({
      model: FIXER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MAX_TOKENS,
      temperature: 0.1,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[cost-repair] LLM call failed: ${res.status} ${errBody.slice(0, 200)}`)
    return []
  }
  const j: any = await res.json()
  const text: string = j.choices?.[0]?.message?.content ?? ''
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) {
    console.error(`[cost-repair] response did not contain a JSON array: ${text.slice(0, 200)}`)
    return []
  }
  try {
    const parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r) => typeof r?.word_id === 'string' && typeof r?.action === 'string')
  } catch (err) {
    console.error(`[cost-repair] JSON parse failed: ${(err as Error).message}`)
    return []
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: cost-repair.tsx <state.json> [--write]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const pv: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []

  const flagged: FlaggedRow[] = []
  for (const v of pv) {
    if (v.engine_c_flag !== 'over' && v.engine_c_flag !== 'under') continue
    const unitPrice = (typeof v.price_estimate_gbp === 'number' && v.price_estimate_gbp > 0)
      ? v.price_estimate_gbp
      : (typeof v.engine_c_our_unit_gbp === 'number' && v.engine_c_our_unit_gbp > 0)
        ? v.engine_c_our_unit_gbp
        : 0
    if (!unitPrice) continue
    flagged.push({
      word_id: String(v.word_id ?? ''),
      word_name: String(v.word_name ?? v.part_name ?? ''),
      manufacturer: v.manufacturer ?? null,
      part_number: v.part_number ?? null,
      quantity: Number(v.quantity ?? 1),
      current_unit_price_gbp: unitPrice,
      engine_b_component_class: String(v.engine_b_component_class ?? 'unknown'),
      engine_c_flag: v.engine_c_flag,
      engine_c_ref_median_gbp: typeof v.engine_c_ref_median_gbp === 'number' ? v.engine_c_ref_median_gbp : null,
      engine_c_ratio: typeof v.engine_c_ratio === 'number' ? v.engine_c_ratio : null,
    })
  }

  console.log(`[cost-repair] ${flagged.length} parts flagged by Engine C (over/under)`)
  if (flagged.length === 0) {
    console.log('[cost-repair] nothing to repair')
    return
  }

  // Batch into chunks of MAX_PARTS_PER_BATCH to keep prompt size reasonable.
  const allResponses: RepairResponse[] = []
  for (let i = 0; i < flagged.length; i += MAX_PARTS_PER_BATCH) {
    const batch = flagged.slice(i, i + MAX_PARTS_PER_BATCH)
    console.log(`[cost-repair] batch ${Math.floor(i / MAX_PARTS_PER_BATCH) + 1}: ${batch.length} parts → ${FIXER_MODEL}`)
    const t0 = Date.now()
    const responses = await callFixer(batch)
    console.log(`[cost-repair]   received ${responses.length} responses in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    allResponses.push(...responses)
  }

  let corrected = 0
  let manualSourcing = 0
  let leaveAsIs = 0

  for (const r of allResponses) {
    const idx = pv.findIndex((v: any) => v.word_id === r.word_id)
    if (idx < 0) continue
    pv[idx].cost_repair_action = r.action
    pv[idx].cost_repair_reasoning = r.reasoning
    pv[idx].cost_repair_confidence = r.confidence
    if (r.source) pv[idx].cost_repair_source = r.source
    if (r.action === 'corrected' && typeof r.corrected_unit_price_gbp === 'number' && r.corrected_unit_price_gbp > 0) {
      const correctedPrice = Math.round(r.corrected_unit_price_gbp * 100) / 100
      const oldPrice = pv[idx].price_estimate_gbp
      pv[idx].price_estimate_gbp = correctedPrice
      pv[idx].price_estimate_high_gbp = Math.round(correctedPrice * 1.3 * 100) / 100
      pv[idx].price_estimate_low_gbp = Math.round(correctedPrice * 0.7 * 100) / 100
      pv[idx].cost_repair_corrected_price_gbp = correctedPrice
      pv[idx].cost_repair_previous_price_gbp = oldPrice
      // Mark estimate source so the renderer/downstream can identify this row
      // was post-corrected. Engine B's batch-economics skip still applies to
      // 'curve' rows; we don't change estimate_source so subsequent stages
      // continue to treat it as already volume-anchored.
      corrected++
    } else if (r.action === 'manual_sourcing_required') {
      pv[idx].cost_repair_excluded_from_subtotal = true
      manualSourcing++
    } else {
      leaveAsIs++
    }
  }

  console.log(`[cost-repair] verdicts: corrected=${corrected}, manual_sourcing=${manualSourcing}, leave_as_is=${leaveAsIs} (of ${allResponses.length} responses)`)

  // Aggregate summary onto state for the renderer to surface
  state.cost_repair_summary = {
    flagged_count: flagged.length,
    corrected_count: corrected,
    manual_sourcing_count: manualSourcing,
    leave_as_is_count: leaveAsIs,
    fixer_model: FIXER_MODEL,
    generated_at: new Date().toISOString(),
  }
  state.partVerifications = pv

  if (write) {
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[cost-repair] wrote ${statePath}`)
  } else {
    console.log('[cost-repair] dry run; pass --write to persist')
  }
}

main().catch((err) => {
  console.error(`[cost-repair] FATAL: ${err}`)
  process.exit(1)
})
