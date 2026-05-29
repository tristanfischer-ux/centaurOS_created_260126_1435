/**
 * determinism-check.tsx — Phase E1 of the deterministic-generation plan.
 *
 * Proves the convergence thesis: run the same brief twice and the DESIGN's
 * part identity + engineering numbers + prices must be byte-identical. Prose
 * wording may legitimately vary (some reviewer models ignore the seed), so the
 * check is over a STRUCTURED SLICE, not the whole state.json / PDF bytes
 * (per the design council 2026-05-28: "structural identity determinism", not
 * full byte-determinism).
 *
 * The slice:
 *   1. Locked part identity — for every word: { moduleId, subId, wordId,
 *      characterId, lockedMods } where lockedMods are the modifier_characters
 *      whose kind is in EMITTER_LOCKED_KINDS (part_number / manufacturer /
 *      rating_* / capacity / dimension / form / material / regulatory / quantity).
 *   2. Engineering numbers — orchestratorContract.quantities (the canonical
 *      single-source fields Phase B established).
 *   3. Prices — partVerifications mapped MPN/key -> rendered unit price.
 *
 * Usage:  npx tsx scripts/determinism-check.tsx <stateA.json> <stateB.json>
 * Exit 0 = identical slice (deterministic). Exit 1 = drift (prints the diffs).
 *
 * Also exposes extractIdentitySlice() so it can double as the regression-harness
 * invariant `UNIVERSAL.emitter_identity_deterministic` (words_missing must be 0
 * and slice hashes must match between two same-brief runs).
 */

import { readFileSync } from 'fs'
import { EMITTER_LOCKED_KINDS, normKind } from '../src/lib/pdf-engine-v2/lib/emitter-identity-lock'

const LOCKED_NORM = new Set([...EMITTER_LOCKED_KINDS].map(normKind))

function getModules(state: any): any[] {
  return (
    state?.moduleDecomposition?.modules ??
    state?.design?.modules ??
    state?.modules ??
    []
  )
}

function lockedModSig(mods: any[]): string {
  return (Array.isArray(mods) ? mods : [])
    .filter((mc) => LOCKED_NORM.has(normKind(mc?.kind)))
    .map((mc) => `${normKind(mc?.kind)}=${String(mc?.value ?? '').trim()}`)
    .sort()
    .join('|')
}

/** Deterministic, order-independent slice of the parts identity. */
export function extractIdentitySlice(state: any): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of getModules(state)) {
    const moduleId = String(m?.module ?? '')
    for (const sm of m?.sub_modules ?? []) {
      const subId = String(sm?.id ?? '')
      for (const w of sm?.words ?? []) {
        const wid = String(w?.id ?? w?.word_id ?? '')
        const cid = String(w?.content_character?.character_id ?? '')
        // key by (module, sub, word) — stable across runs of the same brief
        out[`${moduleId}::${subId}::${wid}`] = `cid=${cid};${lockedModSig(w?.modifier_characters)}`
      }
    }
  }
  return out
}

function extractQuantities(state: any): Record<string, unknown> {
  const q = state?.orchestratorContract?.quantities ?? state?.engineeringContract?.quantities ?? {}
  // sort keys for stable comparison
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(q).sort()) out[k] = q[k]
  return out
}

function extractPrices(state: any): Record<string, number> {
  const pv = state?.partVerifications ?? []
  const out: Record<string, number> = {}
  for (const v of Array.isArray(pv) ? pv : []) {
    const key = String(v?.mpn ?? v?.part_number ?? v?.word_id ?? v?.id ?? JSON.stringify(v?.name_human ?? ''))
    const price = Number(v?.cost_repair_corrected_price_gbp ?? v?.price_estimate_gbp ?? v?.unit_price_gbp ?? NaN)
    if (Number.isFinite(price)) out[key] = price
  }
  return out
}

function diffRecords(a: Record<string, any>, b: Record<string, any>, label: string): string[] {
  const diffs: string[] = []
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of [...keys].sort()) {
    const av = JSON.stringify(a[k] ?? null)
    const bv = JSON.stringify(b[k] ?? null)
    if (av !== bv) diffs.push(`  [${label}] ${k}: A=${av} B=${bv}`)
  }
  return diffs
}

function main() {
  const [, , pathA, pathB] = process.argv
  if (!pathA || !pathB) {
    console.error('Usage: npx tsx scripts/determinism-check.tsx <stateA.json> <stateB.json>')
    process.exit(2)
  }
  const A = JSON.parse(readFileSync(pathA, 'utf8'))
  const B = JSON.parse(readFileSync(pathB, 'utf8'))

  const allDiffs = [
    ...diffRecords(extractIdentitySlice(A), extractIdentitySlice(B), 'identity'),
    ...diffRecords(extractQuantities(A), extractQuantities(B), 'quantity'),
    ...diffRecords(extractPrices(A), extractPrices(B), 'price'),
  ]

  if (allDiffs.length === 0) {
    console.error('determinism-check: PASS — parts identity + numbers + prices are byte-identical across the two runs.')
    process.exit(0)
  }
  console.error(`determinism-check: FAIL — ${allDiffs.length} slice difference(s) between runs:`)
  for (const d of allDiffs.slice(0, 120)) console.error(d)
  if (allDiffs.length > 120) console.error(`  …and ${allDiffs.length - 120} more`)
  process.exit(1)
}

if (require.main === module) main()
