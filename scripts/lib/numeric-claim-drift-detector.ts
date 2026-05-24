/**
 * Numeric-claim drift detector (universal — runs for every chain, every class).
 *
 * Root cause it addresses: orchestrator tools emit structured count outputs
 * (e.g. PyBaMM-driven `bms_slave_count = 313`) into
 * state.orchestratorContract.quantities. The LLM-generated module narrative
 * (overview_paragraph_en, module_brief) reads those values and writes them
 * into prose. The deterministic-emitter, INDEPENDENTLY, picks BoM word
 * quantities based on a different assumption (e.g. 24-channel slaves: 3,750
 * cells / 24 ≈ 165 slaves). The two paths diverge.
 *
 * BESS L17 example:
 *   - state.orchestratorContract.quantities.bms_slave_count.value = 313
 *   - Module narrative: "PyBaMM sizing requires 313 BMS slave boards"
 *   - BoM line: "165x Custom 24-channel cell-voltage + temperature board"
 *   - Drift: 313 vs 165, ratio 1.90× — the reader sees BOTH numbers and
 *     can't reconcile them.
 *
 * The detector walks every key in orchestratorContract.quantities, finds
 * the matching BoM word (by name-substring), and compares. Any contract
 * value vs BoM quantity drift > 5% with absolute difference > 5 units is
 * flagged. Severity: HIGH for > 20% drift, MED for 5-20% drift.
 *
 * Universal across all 35 archetypes — applies wherever orchestrator tools
 * compute counts and the BoM emits structured words with quantities.
 *
 * Wired into serial-design-chain-v2.tsx alongside the other audits. Exit
 * code 12 on any HIGH finding.
 */

import { readFileSync } from 'node:fs'

interface NumericClaim {
  contract_key: string
  contract_value: number
  noun_search_terms: string[]
}

interface BomWordQty {
  word_id: string
  word_name_human: string
  module_id: string
  sub_module_id: string
  quantity: number
}

export interface NumericDriftFinding {
  contract_key: string
  contract_value: number
  bom_word_id: string
  bom_word_name: string
  bom_quantity: number
  module_id: string
  sub_module_id: string
  drift_pct: number
  ratio: number
  severity: 'HIGH' | 'MED' | 'LOW'
  explanation: string
}

export interface NumericDriftResult {
  findings: NumericDriftFinding[]
  contract_quantities_checked: number
  bom_words_scanned: number
  unmatched_contract_quantities: string[]
}

// ── EXTRACT CONTRACT-CLAIM QUANTITIES ────────────────────────────────────────

/** Map a contract-key like `bms_slave_count` to a list of substrings that
 * would identify the matching BoM word. Strip count suffixes, normalise
 * separators. */
function nounSearchTerms(contractKey: string): string[] {
  const base = contractKey
    .toLowerCase()
    .replace(/_count$|_qty$|_quantity$|_number$|_num$/, '')
    .replace(/_/g, ' ')
    .trim()
  const variants = new Set<string>()
  variants.add(base) // "bms slave"
  variants.add(base.replace(/\s+/g, '_')) // "bms_slave"
  variants.add(base.split(' ').slice(-2).join(' ')) // "bms slave"
  variants.add(base.split(' ').slice(-1)[0]) // "slave"
  return Array.from(variants).filter((v) => v.length >= 3)
}

/** Pull every numeric count from orchestratorContract.quantities. */
function extractContractClaims(state: any): NumericClaim[] {
  const out: NumericClaim[] = []
  const quantities = state?.orchestratorContract?.quantities
  if (!quantities || typeof quantities !== 'object') return out
  for (const [key, entry] of Object.entries(quantities as Record<string, any>)) {
    if (!entry || typeof entry !== 'object') continue
    const raw = (entry as any).value
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    if (raw < 2) continue // skip 0/1 — not meaningful drift
    // Only consider COUNTS (integer-typed quantities) — skip voltages,
    // currents, percentages, etc. which are continuous physical quantities
    // and aren't represented as a BoM line item.
    const isCountKey = /_count$|_qty$|_quantity$|_number$|_num$|^count_/.test(key)
    if (!isCountKey) continue
    out.push({
      contract_key: key,
      contract_value: raw,
      noun_search_terms: nounSearchTerms(key),
    })
  }
  return out
}

// ── EXTRACT BoM WORD QUANTITIES ──────────────────────────────────────────────

function parseQuantity(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const m = raw.replace(/[×x,\s]/g, '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function extractBomWordQuantities(state: any): BomWordQty[] {
  const out: BomWordQty[] = []
  const modules: any[] =
    state?.moduleDecomposition?.modules ?? state?.module_decomposition?.modules ?? state?.modules ?? []
  for (const m of modules) {
    const moduleId = String(m?.module ?? m?.id ?? 'unknown')
    const subs: any[] = Array.isArray(m?.sub_modules) ? m.sub_modules : []
    for (const sm of subs) {
      const subId = String(sm?.id ?? sm?.sub_module_id ?? 'unknown')
      const words: any[] = Array.isArray(sm?.words) ? sm.words : []
      for (const w of words) {
        const id = String(w?.id ?? w?.content_character?.character_id ?? '')
        const name = String(w?.name_human ?? w?.content_character?.name_human ?? id ?? '')
        const mods: any[] = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        const qmod = mods.find((mc) => mc.kind === 'quantity')
        if (!qmod) continue
        const qty = parseQuantity(String(qmod.value))
        if (qty == null || qty < 2) continue
        out.push({ word_id: id, word_name_human: name, module_id: moduleId, sub_module_id: subId, quantity: qty })
      }
    }
  }
  return out
}

// ── MATCHING + COMPARISON ────────────────────────────────────────────────────

function findMatchingBomWord(claim: NumericClaim, bom: BomWordQty[]): BomWordQty | null {
  // Try each search term against word_id and word_name_human. Return the
  // FIRST plausible match — words tend to be uniquely named per concept.
  const scoreOf = (w: BomWordQty): number => {
    const idLower = w.word_id.toLowerCase()
    const nameLower = w.word_name_human.toLowerCase()
    for (const term of claim.noun_search_terms) {
      if (idLower.includes(term) || nameLower.includes(term)) {
        // Prefer the longest matching term — more specific.
        return term.length
      }
    }
    return 0
  }
  let best: { w: BomWordQty; score: number } | null = null
  for (const w of bom) {
    const s = scoreOf(w)
    if (s > 0 && (!best || s > best.score)) best = { w, score: s }
  }
  return best?.w ?? null
}

// ── MAIN DETECTOR ────────────────────────────────────────────────────────────

export function detectNumericDrift(state: any): NumericDriftResult {
  const claims = extractContractClaims(state)
  const bom = extractBomWordQuantities(state)
  const findings: NumericDriftFinding[] = []
  const unmatched: string[] = []
  for (const claim of claims) {
    const word = findMatchingBomWord(claim, bom)
    if (!word) {
      unmatched.push(claim.contract_key)
      continue
    }
    const drift = Math.abs(claim.contract_value - word.quantity)
    if (drift < 5) continue // ignore small absolute differences
    const ratio = claim.contract_value / word.quantity
    const driftPct = (drift / Math.max(claim.contract_value, word.quantity)) * 100
    if (driftPct < 5) continue
    const severity: 'HIGH' | 'MED' | 'LOW' = driftPct > 20 ? 'HIGH' : driftPct > 5 ? 'MED' : 'LOW'
    findings.push({
      contract_key: claim.contract_key,
      contract_value: claim.contract_value,
      bom_word_id: word.word_id,
      bom_word_name: word.word_name_human,
      bom_quantity: word.quantity,
      module_id: word.module_id,
      sub_module_id: word.sub_module_id,
      drift_pct: driftPct,
      ratio,
      severity,
      explanation:
        `orchestratorContract.quantities.${claim.contract_key} = ${claim.contract_value} ` +
        `but BoM word "${word.word_name_human}" (id ${word.word_id}) has quantity ${word.quantity}. ` +
        `Drift ${driftPct.toFixed(1)}% (ratio ${ratio.toFixed(2)}×). ` +
        `Reader sees both numbers in the narrative + BoM and cannot reconcile them.`,
    })
  }
  return {
    findings,
    contract_quantities_checked: claims.length,
    bom_words_scanned: bom.length,
    unmatched_contract_quantities: unmatched,
  }
}

// ── CLI ENTRYPOINT ───────────────────────────────────────────────────────────

function renderMarkdown(result: NumericDriftResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Numeric-Claim Drift Detector — ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.contract_quantities_checked} orchestrator quantities checked** against ${result.bom_words_scanned} BoM words. ` +
      `${result.unmatched_contract_quantities.length} contract quantities had no BoM word match.`,
  )
  lines.push('')
  if (result.findings.length === 0) {
    lines.push('✅ **PASS** — no drift detected between orchestrator-computed counts and BoM-emitted quantities.')
    return lines.join('\n')
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  lines.push(`❌ **FAIL** — ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED.`)
  lines.push('')
  for (const f of result.findings) {
    lines.push(`## [${f.severity}] ${f.contract_key} drift`)
    lines.push(`- **Module:** ${f.module_id} → ${f.sub_module_id}`)
    lines.push(`- **Contract claim:** ${f.contract_key} = **${f.contract_value}**`)
    lines.push(`- **BoM word:** ${f.bom_word_name} (id ${f.bom_word_id}) = **${f.bom_quantity}**`)
    lines.push(`- **Drift:** ${f.drift_pct.toFixed(1)}% (ratio ${f.ratio.toFixed(2)}×)`)
    lines.push(`- **Reason:** ${f.explanation}`)
    lines.push('')
  }
  if (result.unmatched_contract_quantities.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('### Unmatched contract quantities (advisory)')
    lines.push('')
    lines.push('These orchestrator-computed counts had no matching BoM word — either the count is not represented as a BoM line item, or the matcher could not find it:')
    lines.push('')
    for (const k of result.unmatched_contract_quantities) lines.push(`- \`${k}\``)
  }
  return lines.join('\n')
}

const argv1 = process.argv[1] ?? ''
const isMain = /numeric-claim-drift-detector\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: numeric-claim-drift-detector <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(`[drift-detector] failed to read ${statePath}: ${(err as Error).message}`)
    process.exit(1)
  }
  const result = detectNumericDrift(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[drift-detector] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  // Exit 12 on any HIGH finding (reserved alongside 10/11/13).
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(`[drift-detector] FAIL: ${high.length} HIGH-severity drift(s)`)
    process.exit(12)
  }
  console.log(
    `[drift-detector] PASS: ${result.contract_quantities_checked} contract quantities checked, ${result.findings.length} drifts (${result.findings.filter((f) => f.severity === 'MED').length} MED)`,
  )
}
