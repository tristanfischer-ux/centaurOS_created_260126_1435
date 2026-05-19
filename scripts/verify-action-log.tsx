#!/usr/bin/env npx tsx
/**
 * scripts/verify-action-log.tsx — Cost-free verification of the
 * action-log instrumentation. Runs two REAL deterministic stages
 * (physics ledger, compliance gate) + simulates the remaining stages'
 * records. Writes to /tmp/action-log-sample/actions.jsonl.
 *
 * Usage:  npx tsx scripts/verify-action-log.tsx
 */
import { runPhysicsLedger } from '../src/lib/pdf-engine-v2/stages/0.1-physics-ledger'
import { runComplianceGate } from '../src/lib/pdf-engine-v2/stages/3.5-compliance-gate'
import { attachActionLogger, getActionLogger } from '../src/lib/pdf-engine-v2/lib/action-logger'
import { readFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

async function main() {
  const outDir = '/tmp/action-log-sample'
  mkdirSync(outDir, { recursive: true })
  attachActionLogger(outDir)

  getActionLogger().log({ step_name: 'pipeline_init', action_type: 'init', pa_mode: true, brief_chars: 1234 })

  // Real deterministic stages (no LLM cost)
  await runPhysicsLedger(
    'A 50 kW residential BESS. Cost target £8,000. Mass under 200 kg.',
    null,
    'energy_storage',
  )
  await runComplianceGate(
    'A residential BESS for the UK domestic market. IEC 62619, G99 compliance.',
    null,
    'energy_storage',
  )

  // Simulate LLM-driven stage records (the shape the instrumented helpers emit).
  const logger = getActionLogger()

  // Stage: brief parsing
  logger.logStage({ step_name: 'brief_parsing', action_type: 'stage_start', brief_chars: 1234 })
  logger.logLlm({ step_name: 'brief_parsing', model: 'google/gemini-3.1-pro-preview', prompt_tokens: 1200, completion_tokens: 4200, latency_ms: 14_500, finish_reason: 'stop', ok: true })
  logger.logStage({ step_name: 'brief_parsing', action_type: 'stage_end', outcome: 'ok', duration_ms: 14_800, confidence: 'HIGH', missing_count: 0 })

  // Stage: research
  logger.logStage({ step_name: 'research', action_type: 'stage_start', variant: 'pa_synthesis' })
  logger.logLlm({ step_name: 'research', model: 'xiaomi/mimo-v2.5-pro', prompt_tokens: 2_400, completion_tokens: 18_500, latency_ms: 45_200, finish_reason: 'stop', ok: true })
  logger.logStage({ step_name: 'research', action_type: 'stage_end', outcome: 'ok', duration_ms: 45_400 })

  // Stage: module decomposition (audit Gap #2 — 6 emitters)
  logger.logStage({ step_name: 'module_decomposition', action_type: 'stage_start', multi_emitter: true })
  for (const m of ['x-ai/grok-4.3', 'google/gemini-3.1-pro-preview', 'z-ai/glm-5.1', 'xiaomi/mimo-v2.5-pro', 'moonshotai/kimi-k2.6', 'qwen/qwen3.6-max-preview']) {
    logger.logLlm({
      step_name: 'module_decomposition:emitter',
      model: m,
      prompt_tokens: 12_000,
      completion_tokens: 35_000,
      latency_ms: 90_000,
      finish_reason: 'stop',
      ok: true,
      emitter_role: m.split('/')[0],
    })
  }
  // 2 judges + tiebreak (per CLAUDE.md item 5)
  for (const m of ['google/gemini-3.1-pro-preview', 'anthropic/claude-haiku-4.5']) {
    logger.logLlm({
      step_name: 'module_decomposition:judge',
      model: m,
      prompt_tokens: 25_000,
      completion_tokens: 3_500,
      latency_ms: 30_000,
      finish_reason: 'stop',
      ok: true,
      role: 'judge',
    })
  }
  logger.logStage({ step_name: 'module_decomposition', action_type: 'stage_end', outcome: 'ok', duration_ms: 120_000 })

  // Engine A retry loop (audit Gap #3 — the iter-12A 4900→3500 use case)
  logger.logStage({ step_name: 'engine_a_corrective_loop', action_type: 'stage_start', max_retries: 2, deviation_gate_pct: 50 })
  logger.logGate({ step_name: 'engine_a_corrective_loop', gate_name: 'bom_cost_band', verdict: 'OUT_OF_BAND', score: 145.6, reasons: ['BoM total £9,420 is 145% above the band high £3,840'], iteration: 0 })
  logger.logLlm({ step_name: 'engine_a_re_emit', model: 'google/gemini-3.1-flash-lite', prompt_tokens: 4_500, completion_tokens: 1_800, latency_ms: 8_900, finish_reason: 'stop', ok: true })
  logger.logRepair({
    step_name: 'engine_a_retry_1',
    target_field: 'state.bomLines',
    before_value: { total_gbp: 9420, cell_count: 4900, line_count: 42 },
    after_value:  { total_gbp: 7100, cell_count: 3500, line_count: 38 },
    key_changes: 'total: £9420 → £7100; cell_count: 4900 → 3500; line_count: 42 → 38',
    attempt: 1,
    max_retries: 2,
  })
  logger.logGate({ step_name: 'engine_a_corrective_loop', gate_name: 'bom_cost_band', verdict: 'PASS', score: 8.4, reasons: ['within tolerance'], iteration: 1 })
  logger.logStage({ step_name: 'engine_a_corrective_loop', action_type: 'stage_end', outcome: 'ok', final_verdict: 'in_band', attempts: 1 })

  // Council scoring
  logger.logStage({ step_name: 'council_scoring', action_type: 'stage_start' })
  for (const section of ['ExecutiveSummary', 'Brief', 'BOM', 'Cost', 'Suppliers']) {
    for (const judge of ['x-ai/grok-4.3', 'openai/gpt-5.4', 'google/gemini-3.1-flash-lite']) {
      logger.logLlm({ step_name: 'council_scoring', model: judge, prompt_tokens: 6_000, completion_tokens: 1_200, latency_ms: 18_000, finish_reason: 'stop', ok: true, role: 'judge', section })
    }
    logger.logGate({
      step_name: 'council_scoring',
      gate_name: `council_scorer:${section}`,
      verdict: section === 'BOM' ? 'WARN' : 'PASS',
      score: section === 'BOM' ? 6 : 8,
      reasons: section === 'BOM' ? ['Generic part names'] : ['Specific + sourced'],
      scorer: 'council',
    })
  }
  logger.logStage({ step_name: 'council_scoring', action_type: 'stage_end', outcome: 'ok', duration_ms: 280_000, average_score: 7.6, sections_scored: 5, sections_failed: 0 })

  // Stage: pdf render
  logger.logStage({ step_name: 'pdf', action_type: 'stage_end', outcome: 'ok', duration_ms: 22_000, page_count: 84 })

  // Print summary
  const records = readFileSync(resolve(outDir, 'actions.jsonl'), 'utf-8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l))
  console.log(`\nTotal records: ${records.length}`)
  const types: Record<string, number> = {}
  for (const r of records) types[r.action_type] = (types[r.action_type] ?? 0) + 1
  console.log(`By action_type:`, types)
  const steps: Record<string, number> = {}
  for (const r of records) steps[r.step_name] = (steps[r.step_name] ?? 0) + 1
  console.log(`By step_name:`)
  for (const [k, v] of Object.entries(steps).sort((a,b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)

  console.log(`\n=== SAMPLE RECORDS (one per action_type) ===`)
  const seen = new Set<string>()
  for (const r of records) {
    if (seen.has(r.action_type)) continue
    seen.add(r.action_type)
    console.log(`\n--- ${r.action_type} ---`)
    console.log(JSON.stringify(r, null, 2))
  }

  // Cost rollup
  let totalCostUsd = 0
  for (const r of records) {
    if (typeof r.cost_usd === 'number') totalCostUsd += r.cost_usd
  }
  console.log(`\nEstimated total LLM cost (per spec): $${totalCostUsd.toFixed(4)} USD`)
}

main().catch(err => { console.error(err); process.exit(1) })
