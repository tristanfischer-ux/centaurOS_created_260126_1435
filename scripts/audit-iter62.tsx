#!/usr/bin/env npx tsx
// Audit harness for the 10-class fan-out. Reads every iter-62-* state.json
// and produces a side-by-side comparison: acceptance status, part-verification
// counts, hallucination rate (stripped/total), design decisions count,
// Phase 2 gate trajectory (start → end / 14 gates), final failing gates.
//
// Usage: npx tsx scripts/audit-iter62.tsx [iter-prefix=iter-62]

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const CLASSES = ['cgm', 'drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'vertical-farm', 'auv', 'bess-container', 'haps']

interface Row {
  cls: string
  acceptance: string
  finalStatus: string
  parts_total: number | null
  parts_verified: number | null
  parts_stripped: number | null
  parts_uncertain: number | null
  recs_total: number | null
  recs_unknown: number | null
  decisions: number
  phase2_start_grammar: string
  phase2_end_grammar: string
  phase2_end_score: number
  phase2_iters: number
  final_failed_gates: string[]
  hallucination_rate: string
}

function parsePhase2(jsonl: string): { start: any; end: any; iters: number } {
  const lines = jsonl.trim().split('\n')
  const iters = lines.map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(r => r && typeof r.step === 'string' && /^phase2_iter_\d+$/.test(r.step))
  if (iters.length === 0) return { start: null, end: null, iters: 0 }
  return { start: iters[0], end: iters[iters.length - 1], iters: iters.length }
}

function read(cls: string, prefix: string): Row | null {
  const base = `/Users/tristanfischer/Downloads/bess-iter/${prefix}-${cls}`
  const statePath = `${base}/container/state.json`
  const actionsPath = `${base}/container/actions.jsonl`
  const runlog = `${base}/run.log`
  if (!existsSync(statePath) && !existsSync(runlog)) return null

  let state: any = null
  if (existsSync(statePath)) {
    try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
  }

  let finalStatus = 'NO RUN'
  if (existsSync(runlog)) {
    const log = readFileSync(runlog, 'utf8')
    if (/=== FINAL ===/.test(log)) finalStatus = 'FINAL'
    else if (/FATAL/.test(log)) {
      // FATAL post-state-save (e.g. renderer crashed but state.json is complete) → RECOVERED
      finalStatus = state && state.acceptanceStatus ? 'RECOVERED' : 'FATAL'
    }
    else if (/STEP \d|Phase 2 iter/.test(log)) finalStatus = 'RUNNING'
  }
  if (!state) {
    return {
      cls, acceptance: '-', finalStatus,
      parts_total: null, parts_verified: null, parts_stripped: null, parts_uncertain: null,
      recs_total: null, recs_unknown: null, decisions: 0,
      phase2_start_grammar: '-', phase2_end_grammar: '-', phase2_end_score: 0, phase2_iters: 0,
      final_failed_gates: [], hallucination_rate: '-',
    }
  }

  const sum = state.partVerificationSummary || {}
  const decisions = Array.isArray(state.designDecisions) ? state.designDecisions.length : 0
  const acceptance = String(state.acceptanceStatus || '-')

  let phase2 = { start: null, end: null, iters: 0 }
  if (existsSync(actionsPath)) {
    try { phase2 = parsePhase2(readFileSync(actionsPath, 'utf8')) } catch {}
  }
  const startG = phase2.start ? `${phase2.start.grammar.passed}/${phase2.start.grammar.passed + phase2.start.grammar.failed}` : '-'
  const endG = phase2.end ? `${phase2.end.grammar.passed}/${phase2.end.grammar.passed + phase2.end.grammar.failed}` : '-'
  const endScore = phase2.end ? phase2.end.grammar.total_score + (phase2.end.arithmetic?.total_score || 0) : 0
  const failedGates = phase2.end ? (phase2.end.grammar.failures || []).map((f: any) => f.name).slice(0, 6) : []

  const total = sum.total ?? 0
  const stripped = sum.stripped ?? 0
  const rate = total > 0 ? `${((stripped / total) * 100).toFixed(0)}%` : '-'

  return {
    cls, acceptance, finalStatus,
    parts_total: sum.total ?? null,
    parts_verified: sum.verified ?? null,
    parts_stripped: sum.stripped ?? null,
    parts_uncertain: sum.uncertain ?? null,
    recs_total: sum.recommendations_total ?? null,
    recs_unknown: sum.recommendations_unknown ?? null,
    decisions,
    phase2_start_grammar: startG,
    phase2_end_grammar: endG,
    phase2_end_score: endScore,
    phase2_iters: phase2.iters,
    final_failed_gates: failedGates,
    hallucination_rate: rate,
  }
}

function main() {
  const prefix = process.argv[2] || 'iter-62'
  const rows = CLASSES.map(c => read(c, prefix)).filter((r): r is Row => r !== null)

  console.log(`\n=== iter-${prefix.replace('iter-', '')} audit ===\n`)
  console.log('CLASS           STATUS          ACCEPTANCE                  PARTS(tot/ver/strip/unc)  RECS(tot/unk)  DEC  P2(start→end iter)  HALLUC')
  console.log('-'.repeat(160))
  for (const r of rows) {
    const parts = `${r.parts_total ?? '-'}/${r.parts_verified ?? '-'}/${r.parts_stripped ?? '-'}/${r.parts_uncertain ?? '-'}`
    const recs = `${r.recs_total ?? '-'}/${r.recs_unknown ?? '-'}`
    const p2 = `${r.phase2_start_grammar}→${r.phase2_end_grammar} (${r.phase2_iters}it)`
    console.log(
      `${r.cls.padEnd(15)} ${r.finalStatus.padEnd(15)} ${r.acceptance.padEnd(27)} ${parts.padEnd(24)} ${recs.padEnd(14)} ${String(r.decisions).padEnd(4)} ${p2.padEnd(19)} ${r.hallucination_rate}`
    )
  }
  console.log()
  console.log('Final failing gates per class:')
  for (const r of rows) {
    if (r.final_failed_gates.length > 0) {
      console.log(`  ${r.cls.padEnd(15)} ${r.final_failed_gates.join(', ')}`)
    }
  }
  console.log()

  // Aggregate
  const finished = rows.filter(r => r.finalStatus === 'FINAL' || r.finalStatus === 'RECOVERED')
  const fatal = rows.filter(r => r.finalStatus === 'FATAL')
  const running = rows.filter(r => r.finalStatus === 'RUNNING')
  const accepted = rows.filter(r => r.acceptance === 'accepted_with_decisions' || r.acceptance === 'accepted_clean').length
  const totalParts = rows.reduce((s, r) => s + (r.parts_total ?? 0), 0)
  const totalStripped = rows.reduce((s, r) => s + (r.parts_stripped ?? 0), 0)
  const totalUnknown = rows.reduce((s, r) => s + (r.recs_unknown ?? 0), 0)
  const totalDecisions = rows.reduce((s, r) => s + r.decisions, 0)

  console.log('Aggregate:')
  console.log(`  finished: ${finished.length}   fatal: ${fatal.length}   running/queued: ${rows.length - finished.length - fatal.length}`)
  console.log(`  accepted (clean OR with-decisions): ${accepted}/${rows.length}`)
  console.log(`  parts total: ${totalParts}   stripped (verified fake): ${totalStripped} (${(totalStripped / totalParts * 100).toFixed(1)}%)`)
  console.log(`  recommendations with confidence=unknown (honest "manual sourcing"): ${totalUnknown}`)
  console.log(`  design decisions surfaced: ${totalDecisions}`)
}

main()
