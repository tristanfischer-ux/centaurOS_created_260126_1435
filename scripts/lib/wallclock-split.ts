/**
 * @file wallclock-split.ts
 * @description Quality-adjusted wall-clock ledger for chain runs.
 *
 * INTENT: Gap analysis on actions.jsonl lied about where time went (e.g. attributing
 * unlogged work before G5/part_verification to `derive_headline`). Speed comparisons
 * against `out/codema-ship` (18.8 min) must separate:
 *   1. baseline_comparable — latency_ms on steps that existed on the ship baseline
 *   2. new_stage — latency_ms on steps introduced after that baseline
 *   3. unlogged_gaps — wall minus attributed latency (instrumentation holes)
 *
 * Prefer `latency_ms` / `duration_ms` over inter-record gaps. Gaps are reported
 * separately so they cannot masquerade as a named step's cost.
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

/** Steps present on out/codema-ship (2026-07-08) — frozen for apples-to-apples compare. */
export const CODEMA_SHIP_BASELINE_STEPS: ReadonlySet<string> = new Set([
  "STEP 5: Single reviewer (Grok 4.3)",
  "STEP 8: R4 Flash-Lite review",
  "advisor_engagement",
  "attribute_phantom_drop",
  "auto_improve",
  "background_enrichment_spawned",
  "benchmark_net",
  "blender_bg_spawned",
  "bom_cost_grounding",
  "brief_augmentation_u5",
  "brief_block",
  "brief_expansion_u6",
  "brief_parsing",
  "brief_plausibility_iter0",
  "brief_target_reconciliation",
  "canonical_product_class_override",
  "cascade_price_adoption",
  "classify",
  "compliance_gate",
  "computed_twin_reconcile",
  "cost_basis",
  "cost_reality_gate",
  "cost_sanity_enforce",
  "cost_sanity_reconciled",
  "cost_sanity_shadow",
  "deployment_envelope",
  "derive_headline",
  "derive_headline_early",
  "derive_process_topology",
  "derive_signal_topology",
  "design_decisions",
  "design_decisions_review",
  "design_loop_early",
  "deterministic_finalize",
  "dossier_repair",
  "dossier_repair_post_ghost_prune",
  "drawing_gates",
  "drawing_set",
  "drawing_set_render",
  "emitter_completion",
  "emitter_identity_reassert",
  "emitter_identity_reassert_pre_render",
  "emitter_identity_snapshot",
  "emitter_identity_snapshot_post_fill",
  "engine_b_estimate_prices",
  "engine_c_reference_anchor",
  "engineering_contract_built",
  "engineering_lock_gate",
  "excel_deliverable",
  "fill_blank_word_mpns",
  "fill_blank_word_mpns_late_sweep",
  "filter_on_dirty_stream_invariant",
  "freshen_scorer_inputs",
  "g5_rag_suggestions",
  "gate21_price_normalisation",
  "gate_23_emitter_completeness",
  "gate_24_shared_quantity_consistency",
  "gate_25_brief_value_literal_scanner",
  "gate_26_per_rack_quantity",
  "gate_27_manufacturer_attribution",
  "gate_28_state_parse_guard",
  "gate_29_submodule_domain_guard",
  "gate_30_payload_rating_audit",
  "generator",
  "ghost_snapshot_prune_and_rederive",
  "hero_image_gemini_i2i",
  "init",
  "interconnect_census",
  "investor_section",
  "join_flow_demands_onto_topology",
  "k10_shadow",
  "library_candidates",
  "library_override_detection",
  "manual_review_badges",
  "mass_attribution",
  "modifier_dedup_pre_phase2",
  "module_images_gemini_i2i",
  "module_paragraph_llm",
  "parse_brief",
  "part_number_inherited_from_sibling",
  "part_reality_check",
  "part_verification",
  "performance_card",
  "phase2_bail_no_progress",
  "phase2_iter_0",
  "phase2_iter_1",
  "phase2_repair_0",
  "phase2_repair_0_jurisdiction_filter",
  "phase2_repair_1",
  "phase2_repair_1_jurisdiction_filter",
  "phase4_skeleton_critic",
  "physics_critic",
  "physics_critic_cache",
  "physics_critic_enforce",
  "physics_critic_rerun",
  "physics_ledger",
  "physics_repair",
  "population_count_reassert",
  "post_phase2_normalise",
  "preflight",
  "principal_equipment_reconcile",
  "propagate_constraints",
  "provenance_rooting_gate",
  "recompute_summary_after_engines",
  "reconcile_hollow",
  "render",
  "render_quality_shadow",
  "render_skipped",
  "requirements_bom",
  "research",
  "research-synthesis",
  "residual_summary",
  "review_completeness_gate",
  "save_state",
  "self_audit_enforce",
  "self_audit_shadow",
  "specialist_review",
  "stage_10_6_part_verify",
  "structural_gate_routing",
  "submodule_prose_pre_phase2",
  "supplier_contact_validation",
  "suppliers_enrichment",
  "sweet_spot_reconciliation",
  "tool_archetype_coherence_enforce",
  "tool_archetype_coherence_shadow",
  "tools_flow_mermaid",
  "verified_parts_allowlist_built",
])

export interface ActionLike {
  step?: string
  step_name?: string
  timestamp?: string
  latency_ms?: number
  duration_ms?: number
  [key: string]: unknown
}

export interface StepLatencyRow {
  step: string
  latency_ms: number
  bucket: 'baseline_comparable' | 'new_stage'
  n_records: number
}

export interface UnloggedGap {
  after_step: string
  before_step: string
  gap_ms: number
  /** True when gap exceeds the previous record's own latency_ms (if any) by this much. */
  excess_ms: number
}

export interface WallclockSplit {
  /** First→last action timestamp wall (ms). */
  wall_ms: number
  /** Sum of latency_ms/duration_ms across all records. */
  attributed_latency_ms: number
  /** wall_ms − attributed_latency_ms (can be negative if overlapping LLM waits). */
  unlogged_ms: number
  baseline_comparable_ms: number
  new_stage_ms: number
  /** Steps with latency, sorted desc. */
  by_step: StepLatencyRow[]
  /** Inter-record gaps larger than threshold that exceed the prior step's latency. */
  unlogged_gaps: UnloggedGap[]
  /** Baseline set size used for classification. */
  baseline_step_count: number
  method: 'latency_ms_preferred'
}

const GAP_FLAG_MS = 5_000

/**
 * @description Classify a step name as baseline-comparable or new-stage.
 * @param step - Action step / step_name
 * @param baseline - Frozen baseline step set (defaults to Codema ship)
 */
export function classifyStep(
  step: string,
  baseline: ReadonlySet<string> = CODEMA_SHIP_BASELINE_STEPS,
): 'baseline_comparable' | 'new_stage' {
  return baseline.has(step) ? 'baseline_comparable' : 'new_stage'
}

/**
 * @description Build the quality-adjusted wall-clock split from actions.jsonl records.
 * @param records - Parsed action log rows
 * @param baseline - Optional override of baseline step names
 */
export function computeWallclockSplit(
  records: ActionLike[],
  baseline: ReadonlySet<string> = CODEMA_SHIP_BASELINE_STEPS,
): WallclockSplit {
  const byStep = new Map<string, StepLatencyRow>()
  let attributed = 0

  for (const r of records) {
    const step = String(r.step ?? r.step_name ?? 'unknown')
    const lat = typeof r.latency_ms === 'number'
      ? r.latency_ms
      : (typeof r.duration_ms === 'number' ? r.duration_ms : 0)
    if (!(lat > 0)) continue
    attributed += lat
    const existing = byStep.get(step)
    if (existing) {
      existing.latency_ms += lat
      existing.n_records += 1
    } else {
      byStep.set(step, {
        step,
        latency_ms: lat,
        bucket: classifyStep(step, baseline),
        n_records: 1,
      })
    }
  }

  const by_step = [...byStep.values()].sort((a, b) => b.latency_ms - a.latency_ms)
  let baseline_comparable_ms = 0
  let new_stage_ms = 0
  for (const row of by_step) {
    if (row.bucket === 'baseline_comparable') baseline_comparable_ms += row.latency_ms
    else new_stage_ms += row.latency_ms
  }

  const stamped = records.filter((r) => typeof r.timestamp === 'string' && r.timestamp.length > 0)
  let wall_ms = 0
  if (stamped.length >= 2) {
    const t0 = Date.parse(stamped[0].timestamp!)
    const t1 = Date.parse(stamped[stamped.length - 1].timestamp!)
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) wall_ms = t1 - t0
  }

  // DECISION: credit the gap to whichever adjacent record already logged
  // latency_ms covering that wall (usually the *next* step, which finishes and
  // stamps latency). Only flag excess beyond max(prevLat, nextLat) — otherwise
  // every slow step looks like an "unlogged gap" before its own log line.
  const latOf = (r: ActionLike): number => {
    if (typeof r.latency_ms === 'number' && r.latency_ms > 0) return r.latency_ms
    if (typeof r.duration_ms === 'number' && r.duration_ms > 0) return r.duration_ms
    return 0
  }
  const unlogged_gaps: UnloggedGap[] = []
  for (let i = 1; i < stamped.length; i++) {
    const prev = stamped[i - 1]
    const cur = stamped[i]
    const gap = Date.parse(cur.timestamp!) - Date.parse(prev.timestamp!)
    if (!Number.isFinite(gap) || gap < GAP_FLAG_MS) continue
    const covered = Math.max(latOf(prev), latOf(cur))
    const excess = gap - covered
    if (excess < GAP_FLAG_MS) continue
    unlogged_gaps.push({
      after_step: String(prev.step ?? prev.step_name ?? '?'),
      before_step: String(cur.step ?? cur.step_name ?? '?'),
      gap_ms: gap,
      excess_ms: excess,
    })
  }
  unlogged_gaps.sort((a, b) => b.excess_ms - a.excess_ms)

  return {
    wall_ms,
    attributed_latency_ms: attributed,
    unlogged_ms: wall_ms - attributed,
    baseline_comparable_ms,
    new_stage_ms,
    by_step,
    unlogged_gaps: unlogged_gaps.slice(0, 25),
    baseline_step_count: baseline.size,
    method: 'latency_ms_preferred',
  }
}

/**
 * @description Load actions.jsonl from a run dir and compute the split.
 * @param outDir - Chain output directory
 */
export function computeWallclockSplitFromDir(outDir: string): WallclockSplit | null {
  const path = resolve(outDir, 'actions.jsonl')
  if (!existsSync(path)) return null
  const records: ActionLike[] = []
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      records.push(JSON.parse(line) as ActionLike)
    } catch {
      /* skip malformed */
    }
  }
  if (records.length === 0) return null
  return computeWallclockSplit(records)
}

/**
 * @description Write wallclock-split.json (+ glanceable .md) next to residual_summary.
 * @param outDir - Chain output directory
 * @returns The split, or null if no actions log
 */
export function emitWallclockSplit(outDir: string): WallclockSplit | null {
  const split = computeWallclockSplitFromDir(outDir)
  if (!split) return null
  writeFileSync(resolve(outDir, 'wallclock-split.json'), JSON.stringify(split, null, 2))
  const fmt = (ms: number): string => {
    if (ms < 0) return `-${fmt(-ms)}`
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60_000).toFixed(2)}m`
  }
  const top = split.by_step.slice(0, 15)
    .map((r) => `| ${r.step} | ${fmt(r.latency_ms)} | ${r.bucket} |`)
    .join('\n')
  const gaps = split.unlogged_gaps.slice(0, 10)
    .map((g) => `| ${g.after_step} → ${g.before_step} | ${fmt(g.gap_ms)} | ${fmt(g.excess_ms)} |`)
    .join('\n')
  const md = [
    '# Wall-clock split (quality-adjusted)',
    '',
    `Method: **${split.method}** (prefer latency_ms; gaps flagged separately).`,
    '',
    `| Metric | Value |`,
    `|---|---:|`,
    `| Wall (first→last action) | ${fmt(split.wall_ms)} |`,
    `| Attributed latency (Σ latency_ms) | ${fmt(split.attributed_latency_ms)} |`,
    `| Baseline-comparable latency | ${fmt(split.baseline_comparable_ms)} |`,
    `| New-stage latency | ${fmt(split.new_stage_ms)} |`,
    `| Unlogged (wall − attributed) | ${fmt(split.unlogged_ms)} |`,
    '',
    '## Top steps by latency_ms',
    '',
    '| Step | Latency | Bucket |',
    '|---|---:|---|',
    top,
    '',
    '## Unlogged gaps (gap ≫ prior step latency)',
    '',
    '| After → Before | Gap | Excess |',
    '|---|---:|---:|',
    gaps || '| _(none ≥5s excess)_ | | |',
    '',
    'Compare **baseline_comparable** to `out/codema-ship` (~18.8 min wall).',
    'Do not treat gap-attributed step names as truth — only latency_ms rows above.',
    '',
  ].join('\n')
  writeFileSync(resolve(outDir, 'wallclock-split.md'), md)
  return split
}

/**
 * @description Fingerprint cost-basis inputs so unchanged BoM/prices can skip rebuild.
 * @param state - Chain state (partVerifications + contract masses + class)
 */
export function costBasisInputFingerprint(state: unknown): string {
  const s = state as {
    partVerifications?: Array<{
      word_id?: string
      price_estimate_gbp?: number
      distributor_price_gbp?: number
      cost_repair_corrected_price_gbp?: number
    }>
    orchestratorContract?: { quantities?: Record<string, unknown> }
    engineeringContract?: { quantities?: Record<string, unknown>; product_class?: string }
    parsedBrief?: { product_class?: string }
    moduleDecomposition?: { product_class?: string }
  }
  const lines = (s.partVerifications ?? [])
    .map((pv) => [
      String(pv.word_id ?? ''),
      pv.cost_repair_corrected_price_gbp ?? '',
      pv.distributor_price_gbp ?? '',
      pv.price_estimate_gbp ?? '',
    ].join(':'))
    .sort()
  const q = {
    ...(s.engineeringContract?.quantities ?? {}),
    ...(s.orchestratorContract?.quantities ?? {}),
  }
  const massKeys = [
    'absorber_shell_mass_kg',
    'stripper_shell_mass_kg',
    'reactor_shell_mass_kg',
    'lime_reactor_shell_mass_kg',
  ]
  const masses = massKeys.map((k) => {
    const v = q[k]
    if (v == null) return `${k}:`
    const n = typeof v === 'object' && v !== null && 'value' in v
      ? Number((v as { value: unknown }).value)
      : Number(v)
    return `${k}:${Number.isFinite(n) ? n : ''}`
  })
  const klass = String(
    s.engineeringContract?.product_class
      ?? s.moduleDecomposition?.product_class
      ?? s.parsedBrief?.product_class
      ?? '',
  )
  const payload = JSON.stringify({ klass, lines, masses })
  return createHash('sha256').update(payload).digest('hex').slice(0, 24)
}

/** Self-test — run via `npx tsx scripts/lib/wallclock-split.ts --selftest`. */
function selftest(): void {
  const baseline = new Set(['a', 'b'])
  const records: ActionLike[] = [
    { step: 'a', timestamp: '2026-07-09T10:00:00.000Z', latency_ms: 60_000 },
    // 120s wall after a; c_new only claims 30s → 90s truly unlogged
    { step: 'c_new', timestamp: '2026-07-09T10:02:00.000Z', latency_ms: 30_000 },
    { step: 'b', timestamp: '2026-07-09T10:05:00.000Z', latency_ms: 10_000 },
    // Honest slow step: 3m gap fully covered by next latency — must NOT flag
    { step: 'covered', timestamp: '2026-07-09T10:08:00.000Z', latency_ms: 180_000 },
  ]
  const split = computeWallclockSplit(records, baseline)
  if (split.baseline_comparable_ms !== 70_000) {
    throw new Error(`expected baseline 70000 got ${split.baseline_comparable_ms}`)
  }
  if (split.new_stage_ms !== 210_000) {
    throw new Error(`expected new_stage 210000 got ${split.new_stage_ms}`)
  }
  if (split.wall_ms !== 480_000) {
    throw new Error(`expected wall 480000 got ${split.wall_ms}`)
  }
  // a→c_new: 120s wall, covered by max(60s,30s)=60s → 60s excess
  const aToC = split.unlogged_gaps.find((g) => g.after_step === 'a' && g.before_step === 'c_new')
  if (!aToC || aToC.excess_ms < 50_000) {
    throw new Error(`expected unlogged gap a→c_new ~60s, got ${JSON.stringify(split.unlogged_gaps)}`)
  }
  if (split.unlogged_gaps.some((g) => g.before_step === 'covered')) {
    throw new Error('fully latency-covered gap must not be flagged as unlogged')
  }
  const fp1 = costBasisInputFingerprint({
    partVerifications: [{ word_id: 'p1', price_estimate_gbp: 10 }],
    engineeringContract: { product_class: 'water_treatment', quantities: {} },
  })
  const fp2 = costBasisInputFingerprint({
    partVerifications: [{ word_id: 'p1', price_estimate_gbp: 10 }],
    engineeringContract: { product_class: 'water_treatment', quantities: {} },
  })
  const fp3 = costBasisInputFingerprint({
    partVerifications: [{ word_id: 'p1', price_estimate_gbp: 11 }],
    engineeringContract: { product_class: 'water_treatment', quantities: {} },
  })
  if (fp1 !== fp2) throw new Error('fingerprint not stable')
  if (fp1 === fp3) throw new Error('fingerprint should change with price')
  console.error('[wallclock-split] --selftest OK')
}

if (typeof process !== 'undefined' && process.argv.includes('--selftest')) {
  selftest()
}
