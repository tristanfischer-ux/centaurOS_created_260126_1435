#!/usr/bin/env npx tsx
/**
 * @file eval-harness/shadow-mode-aggregator.ts — Radical Phase 5 shadow-mode metrics aggregator.
 *
 * Reads all `radical-phase5-state-*.json` snapshots produced by parallel shadow-mode runs
 * (from scripts/run-radical-shadow-baseline.sh) and computes the cutover-decision metrics.
 *
 * Usage:
 *   npx tsx src/lib/pdf-engine-v2/eval-harness/shadow-mode-aggregator.ts <evidence-dir>
 *
 * The evidence-dir should be the output of run-radical-shadow-baseline.sh, e.g.:
 *   ~/Downloads/engine-evidence/radical-shadow-20260510T1234/
 *
 * Each run sub-directory contains:
 *   - run-manifest.json       — slug, productClass, ok, durationMs, pdfSizeBytes, etc.
 *   - state.json              — radical-phase5 state snapshot
 *   - report.pdf              — primary pipeline PDF
 *   - radical.pdf             — Radical renderer PDF (present if Phase 5 OK)
 *   - log.txt                 — full pipeline log
 *   - .done                   — sentinel (present when run completed, even with error)
 *
 * Council cutover criteria:
 *   1. Cost delta ±2% for >99.5% of runs.
 *   2. Pipeline success rate >99.9%.
 *   3. Phase 5 latency ≤120% of primary PDF render latency.
 *   4. Grammar verdict firing rate (≥1 WARN or BLOCK) >10% of runs.
 *   5. Verified-MPN coverage: informational (no gate).
 *   6. Data-gap coverage: informational (no gate).
 *
 * Output: eval-harness/shadow-mode-report-<timestamp>.md
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Types mirroring the actual pipeline output
// ---------------------------------------------------------------------------

interface ResolutionStats {
  total_leaves: number
  verified_by_distributor: number
  from_vendor_catalog: number
  from_llm_estimate: number
  grade_d: number
  stub: number
  data_gap: number
  distributor_calls_made: number
}

interface ResolvedRadicalTree {
  resolution_meta?: {
    product_class?: string
    stats?: ResolutionStats
  }
  composition?: {
    root?: CompositionNode
  }
}

interface CompositionNode {
  archetypeId?: string
  children?: CompositionNode[]
  resolution?: {
    unit_price_gbp?: number | null
    mpn?: string | null
    verification_grade?: string
    source?: string
    qty?: number
  }
}

interface GrammarVerdict {
  rule_id: string
  node_id?: string
  verdict: 'PASS' | 'WARN' | 'BLOCK'
  message?: string
}

interface GrammarVerdicts {
  verdicts: GrammarVerdict[]
  overall_verdict: 'PASS' | 'PASS_WITH_RELAXATION' | 'BLOCK'
}

interface CostSummary {
  bomTotal: number
  assemblyCost: number
  finalUnitCost: number
  overheadMultiplier: number
}

interface Phase5StateSnapshot {
  projectId?: string
  savedAt?: string
  resolvedRadicalTree?: ResolvedRadicalTree
  radicalCostSummary?: CostSummary
  grammarVerdicts?: GrammarVerdicts
}

interface RunManifest {
  slug: string
  brief: string
  productClass: string
  ok: boolean
  errorReason?: string
  totalDurationMs: number
  pdfSizeBytes?: number
  radicalPdfSizeBytes?: number
  primaryRenderMs?: number
  radicalRenderMs?: number
  legacyCostBomTotal?: number
}

interface RunResult {
  slug: string
  productClass: string
  ok: boolean
  errorReason?: string
  state: Phase5StateSnapshot | null
  manifest: RunManifest | null
  primaryPdfSizeBytes: number | null
  radicalPdfSizeBytes: number | null
  primaryRenderMs: number | null
  radicalRenderMs: number | null
  totalDurationMs: number
  /** Legacy finalUnitCost parsed from Phase3/shadow-diff log line */
  legacyCostFinalUnit: number | null
}

// ---------------------------------------------------------------------------
// Helper: parse legacy cost from Phase3/shadow-diff log line
// ---------------------------------------------------------------------------

/**
 * Parse the legacy finalUnitCost from the pipeline log.
 * The pipeline writes: [Phase3/shadow-diff] Legacy (Stage 4):  £<N,NNN>
 * Returns null if not found.
 */
function parseLegacyCostFromLog(logPath: string): number | null {
  try {
    const log = readFileSync(logPath, 'utf-8')
    // Match: [Phase3/shadow-diff] Legacy (Stage 4):  £<digits with commas>
    const match = log.match(/\[Phase3\/shadow-diff\] Legacy \(Stage 4\):\s+£([\d,]+)/)
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10)
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helper: collect all leaf nodes (depth-first)
// ---------------------------------------------------------------------------

function collectLeaves(node: CompositionNode): CompositionNode[] {
  if (!node.children || node.children.length === 0) {
    return [node]
  }
  return node.children.flatMap(child => collectLeaves(child))
}

// ---------------------------------------------------------------------------
// Helper: percentile from sorted array
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

// ---------------------------------------------------------------------------
// Load run results from evidence directory
// ---------------------------------------------------------------------------

function loadRunResults(evidenceDir: string): RunResult[] {
  const results: RunResult[] = []

  if (!existsSync(evidenceDir)) {
    console.error(`[aggregator] Evidence directory not found: ${evidenceDir}`)
    return results
  }

  const entries = readdirSync(evidenceDir)
  for (const entry of entries) {
    const runDir = join(evidenceDir, entry)
    try {
      const stat = statSync(runDir)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }

    const doneFile = join(runDir, '.done')
    const manifestFile = join(runDir, 'run-manifest.json')
    const stateFile = join(runDir, 'state.json')
    const reportPdf = join(runDir, 'report.pdf')
    const radicalPdf = join(runDir, 'radical.pdf')

    // Only process runs that have a .done sentinel
    if (!existsSync(doneFile)) {
      console.warn(`[aggregator] Skipping ${entry} — no .done sentinel (run may still be in-flight)`)
      continue
    }

    let manifest: RunManifest | null = null
    if (existsSync(manifestFile)) {
      try {
        manifest = JSON.parse(readFileSync(manifestFile, 'utf-8')) as RunManifest
      } catch (e) {
        console.warn(`[aggregator] ${entry}: failed to parse run-manifest.json — ${(e as Error).message}`)
      }
    }

    let state: Phase5StateSnapshot | null = null
    if (existsSync(stateFile)) {
      try {
        state = JSON.parse(readFileSync(stateFile, 'utf-8')) as Phase5StateSnapshot
      } catch (e) {
        console.warn(`[aggregator] ${entry}: failed to parse state.json — ${(e as Error).message}`)
      }
    }

    const primaryPdfSizeBytes = existsSync(reportPdf)
      ? statSync(reportPdf).size
      : (manifest?.pdfSizeBytes ?? null)

    const radicalPdfSizeBytes = existsSync(radicalPdf)
      ? statSync(radicalPdf).size
      : (manifest?.radicalPdfSizeBytes ?? null)

    const slug = manifest?.slug ?? entry
    const productClass = manifest?.productClass ?? state?.resolvedRadicalTree?.resolution_meta?.product_class ?? 'unknown'
    const ok = manifest?.ok ?? (state !== null)
    const errorReason = manifest?.errorReason

    // Legacy cost: prefer manifest value, fall back to parsing from log.txt
    const logFile = join(runDir, 'log.txt')
    const legacyCostFromManifest = (manifest?.legacyCostBomTotal != null && manifest.legacyCostBomTotal > 0)
      ? manifest.legacyCostBomTotal
      : null
    const legacyCostFinalUnit = legacyCostFromManifest ?? parseLegacyCostFromLog(logFile)

    results.push({
      slug,
      productClass,
      ok,
      errorReason,
      state,
      manifest,
      primaryPdfSizeBytes,
      radicalPdfSizeBytes,
      primaryRenderMs: manifest?.primaryRenderMs ?? null,
      radicalRenderMs: manifest?.radicalRenderMs ?? null,
      totalDurationMs: manifest?.totalDurationMs ?? 0,
      legacyCostFinalUnit,
    })

    console.log(`[aggregator] Loaded ${slug} (${productClass}) — ok=${ok}${errorReason ? ` [${errorReason}]` : ''}`)
  }

  return results.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ---------------------------------------------------------------------------
// Per-run metric extraction
// ---------------------------------------------------------------------------

interface RunMetrics {
  slug: string
  productClass: string
  ok: boolean
  errorReason?: string

  // Cost delta: (radical.bomTotal - legacy.bomTotal) / legacy.bomTotal
  // null if either cost summary is absent
  costDeltaFraction: number | null

  // Both PDFs written successfully
  bothPdfsOk: boolean

  // Latency ratio: radical render ms / primary render ms
  // null if either latency is unavailable
  latencyRatio: number | null

  // Grammar: did any WARN or BLOCK fire?
  grammarFired: boolean

  // Verification stats from tree
  totalLeaves: number
  verifiedLeaves: number
  dataGapLeaves: number
  verifiedMpnPct: number | null
  dataGapPct: number | null
}

function extractRunMetrics(run: RunResult): RunMetrics {
  const base: RunMetrics = {
    slug: run.slug,
    productClass: run.productClass,
    ok: run.ok,
    errorReason: run.errorReason,
    costDeltaFraction: null,
    bothPdfsOk: false,
    latencyRatio: null,
    grammarFired: false,
    totalLeaves: 0,
    verifiedLeaves: 0,
    dataGapLeaves: 0,
    verifiedMpnPct: null,
    dataGapPct: null,
  }

  if (!run.ok || !run.state) return base

  const state = run.state

  // Cost delta
  // Note: radicalCostSummary.bomTotal = finalUnitCost (fully-loaded) per 4c-radical-cost-rollup.ts
  // Legacy: parsed from [Phase3/shadow-diff] log line which also logs finalUnitCost
  const radicalBomTotal = state.radicalCostSummary?.bomTotal
  const legacyCostFinalUnit = run.legacyCostFinalUnit
  if (
    radicalBomTotal !== undefined &&
    radicalBomTotal !== null &&
    legacyCostFinalUnit !== null &&
    legacyCostFinalUnit !== 0
  ) {
    base.costDeltaFraction = (radicalBomTotal - legacyCostFinalUnit) / legacyCostFinalUnit
  }

  // Both PDFs OK
  base.bothPdfsOk = run.primaryPdfSizeBytes !== null &&
    run.primaryPdfSizeBytes > 0 &&
    run.radicalPdfSizeBytes !== null &&
    run.radicalPdfSizeBytes > 0

  // Latency ratio
  if (
    run.radicalRenderMs !== null &&
    run.primaryRenderMs !== null &&
    run.primaryRenderMs > 0
  ) {
    base.latencyRatio = run.radicalRenderMs / run.primaryRenderMs
  }

  // Grammar
  const verdicts = state.grammarVerdicts?.verdicts ?? []
  base.grammarFired = verdicts.some(v => v.verdict === 'WARN' || v.verdict === 'BLOCK')

  // Leaf verification stats
  const root = state.resolvedRadicalTree?.composition?.root
  const stats = state.resolvedRadicalTree?.resolution_meta?.stats

  if (stats) {
    base.totalLeaves = stats.total_leaves
    base.verifiedLeaves = stats.verified_by_distributor
    base.dataGapLeaves = stats.data_gap
  } else if (root) {
    // Fall back to walking the tree
    const leaves = collectLeaves(root)
    base.totalLeaves = leaves.length
    base.verifiedLeaves = leaves.filter(l => l.resolution?.verification_grade === 'verified').length
    base.dataGapLeaves = leaves.filter(l => l.resolution?.verification_grade === 'data_gap').length
  }

  if (base.totalLeaves > 0) {
    base.verifiedMpnPct = (base.verifiedLeaves / base.totalLeaves) * 100
    base.dataGapPct = (base.dataGapLeaves / base.totalLeaves) * 100
  }

  return base
}

// ---------------------------------------------------------------------------
// Aggregate across runs
// ---------------------------------------------------------------------------

interface AggregateMetrics {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  pipelineSuccessRate: number

  // Cost delta distribution (across successful runs with cost data)
  costDeltaSamples: number
  costDeltaMedian: number | null
  costDeltaP95: number | null
  costDeltaP99: number | null
  costDeltaWithin2PctPct: number | null

  // Both-PDFs success rate
  bothPdfsSuccessRate: number

  // Latency ratio distribution
  latencySamples: number
  latencyRatioMedian: number | null
  latencyRatioP95: number | null
  latencyRatioMax: number | null

  // Grammar firing rate
  grammarFiringRate: number

  // Verification (averages)
  avgVerifiedMpnPct: number | null
  avgDataGapPct: number | null
}

function aggregate(metrics: RunMetrics[]): AggregateMetrics {
  const total = metrics.length
  const successful = metrics.filter(m => m.ok)
  const failed = metrics.filter(m => !m.ok)

  const pipelineSuccessRate = total > 0 ? (successful.length / total) * 100 : 0

  // Cost delta
  const costDeltas = successful
    .map(m => m.costDeltaFraction)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)

  const absCostDeltas = costDeltas.map(d => Math.abs(d))
  const within2Pct = absCostDeltas.filter(d => d <= 0.02)
  const costDeltaWithin2PctPct = costDeltas.length > 0
    ? (within2Pct.length / costDeltas.length) * 100
    : null

  // Both PDFs OK
  const bothPdfCount = successful.filter(m => m.bothPdfsOk).length
  const bothPdfsSuccessRate = successful.length > 0
    ? (bothPdfCount / successful.length) * 100
    : 0

  // Latency ratios
  const latencies = successful
    .map(m => m.latencyRatio)
    .filter((l): l is number => l !== null)
    .sort((a, b) => a - b)

  // Grammar firing rate
  const grammarFiredCount = successful.filter(m => m.grammarFired).length
  const grammarFiringRate = successful.length > 0
    ? (grammarFiredCount / successful.length) * 100
    : 0

  // Verified MPN / data gap averages
  const verifiedPcts = successful
    .map(m => m.verifiedMpnPct)
    .filter((v): v is number => v !== null)
  const dataGapPcts = successful
    .map(m => m.dataGapPct)
    .filter((v): v is number => v !== null)

  const avgVerifiedMpnPct = verifiedPcts.length > 0
    ? verifiedPcts.reduce((a, b) => a + b, 0) / verifiedPcts.length
    : null
  const avgDataGapPct = dataGapPcts.length > 0
    ? dataGapPcts.reduce((a, b) => a + b, 0) / dataGapPcts.length
    : null

  return {
    totalRuns: total,
    successfulRuns: successful.length,
    failedRuns: failed.length,
    pipelineSuccessRate,
    costDeltaSamples: costDeltas.length,
    costDeltaMedian: costDeltas.length > 0 ? percentile(costDeltas, 50) : null,
    costDeltaP95: costDeltas.length > 0 ? percentile(absCostDeltas.sort((a, b) => a - b), 95) : null,
    costDeltaP99: costDeltas.length > 0 ? percentile(absCostDeltas.sort((a, b) => a - b), 99) : null,
    costDeltaWithin2PctPct,
    bothPdfsSuccessRate,
    latencySamples: latencies.length,
    latencyRatioMedian: latencies.length > 0 ? percentile(latencies, 50) : null,
    latencyRatioP95: latencies.length > 0 ? percentile(latencies, 95) : null,
    latencyRatioMax: latencies.length > 0 ? latencies[latencies.length - 1] : null,
    grammarFiringRate,
    avgVerifiedMpnPct,
    avgDataGapPct,
  }
}

// ---------------------------------------------------------------------------
// Cutover-readiness verdict
// ---------------------------------------------------------------------------

type VerdictType = 'READY' | 'NEEDS_CALIBRATION' | 'NEEDS_INFRASTRUCTURE' | 'NEEDS_MORE_RULES'

interface CutoverVerdict {
  verdict: VerdictType
  blockers: string[]
  notes: string[]
}

function determineCutoverReadiness(agg: AggregateMetrics, perClass: Map<string, AggregateMetrics>): CutoverVerdict {
  const blockers: string[] = []
  const notes: string[] = []

  // Criterion 1: cost delta ±2% for >99.5% of runs
  const costOk = agg.costDeltaWithin2PctPct !== null && agg.costDeltaWithin2PctPct >= 99.5
  if (!costOk) {
    if (agg.costDeltaWithin2PctPct === null) {
      notes.push('Cost delta: no data (no runs with both radical and legacy cost summaries).')
    } else {
      blockers.push(
        `Cost delta: ${agg.costDeltaWithin2PctPct.toFixed(1)}% of runs within ±2% ` +
        `(criterion: >99.5%). Likely vendor catalog or Grade D calibration needed.`
      )
    }
  }

  // Criterion 2: pipeline success rate >99.9%
  const successOk = agg.pipelineSuccessRate >= 99.9
  if (!successOk) {
    blockers.push(
      `Pipeline success rate: ${agg.pipelineSuccessRate.toFixed(1)}% ` +
      `(criterion: >99.9%). Infrastructure work required.`
    )
  }

  // Both-PDFs check (sub-criterion for infrastructure)
  const bothPdfsOk = agg.bothPdfsSuccessRate >= 99.9
  if (!bothPdfsOk && successOk) {
    blockers.push(
      `Both-PDF success rate: ${agg.bothPdfsSuccessRate.toFixed(1)}% ` +
      `(criterion: >99.9%). Phase 5 renderer failing for some successful pipeline runs.`
    )
  }

  // Criterion 3: latency ≤120% of primary render
  const latencyOk = agg.latencyRatioP95 === null || agg.latencyRatioP95 <= 1.2
  if (!latencyOk) {
    blockers.push(
      `Phase 5 latency P95: ${((agg.latencyRatioP95 ?? 0) * 100).toFixed(0)}% of primary render ` +
      `(criterion: ≤120%). Renderer optimisation needed.`
    )
  }

  // Criterion 4: grammar firing rate >10%
  const grammarOk = agg.grammarFiringRate > 10
  if (!grammarOk) {
    notes.push(
      `Grammar firing rate: ${agg.grammarFiringRate.toFixed(1)}% ` +
      `(criterion: >10%). Grammar rules are firing rarely — may need v1.5 rule expansion.`
    )
    if (blockers.length === 0) {
      // Only flag as a blocker if everything else is passing
      blockers.push(`Grammar firing rate too low: ${agg.grammarFiringRate.toFixed(1)}% (criterion: >10%)`)
    }
  }

  // Determine verdict type
  let verdict: VerdictType
  if (blockers.length === 0) {
    verdict = 'READY'
  } else if (!successOk || !bothPdfsOk || !latencyOk) {
    verdict = 'NEEDS_INFRASTRUCTURE'
  } else if (!costOk) {
    verdict = 'NEEDS_CALIBRATION'
  } else {
    verdict = 'NEEDS_MORE_RULES'
  }

  return { verdict, blockers, notes }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function fmt(n: number | null, decimals = 1, suffix = ''): string {
  if (n === null) return 'N/A'
  return `${n.toFixed(decimals)}${suffix}`
}

function fmtPct(n: number | null, decimals = 1): string {
  return fmt(n, decimals, '%')
}

function fmtDelta(n: number | null): string {
  if (n === null) return 'N/A'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${(n * 100).toFixed(2)}%`
}

function generateReport(
  evidenceDir: string,
  runs: RunResult[],
  metrics: RunMetrics[],
  agg: AggregateMetrics,
  perClassMetrics: Map<string, RunMetrics[]>,
  perClassAgg: Map<string, AggregateMetrics>,
  verdict: CutoverVerdict,
  timestamp: string,
): string {
  const lines: string[] = []

  lines.push(`# Shadow-Mode Phase 5 Aggregator Report`)
  lines.push(``)
  lines.push(`**Generated:** ${timestamp}`)
  lines.push(`**Evidence directory:** \`${evidenceDir}\``)
  lines.push(`**Runs processed:** ${agg.totalRuns} (${agg.successfulRuns} succeeded, ${agg.failedRuns} failed)`)
  lines.push(``)

  // Overall verdict banner
  lines.push(`## Cutover-Readiness Verdict`)
  lines.push(``)

  const verdictEmoji: Record<VerdictType, string> = {
    READY: '✅ READY',
    NEEDS_CALIBRATION: '⚠️ NEEDS CALIBRATION',
    NEEDS_INFRASTRUCTURE: '🔴 NEEDS INFRASTRUCTURE',
    NEEDS_MORE_RULES: '⚠️ NEEDS MORE RULES',
  }
  lines.push(`### ${verdictEmoji[verdict.verdict]}`)
  lines.push(``)

  if (verdict.blockers.length > 0) {
    lines.push(`**Blockers:**`)
    for (const b of verdict.blockers) {
      lines.push(`- ${b}`)
    }
    lines.push(``)
  }

  if (verdict.notes.length > 0) {
    lines.push(`**Notes:**`)
    for (const n of verdict.notes) {
      lines.push(`- ${n}`)
    }
    lines.push(``)
  }

  // Overall aggregated metrics
  lines.push(`## Overall Aggregated Metrics`)
  lines.push(``)
  lines.push(`| Metric | Value | Criterion | Pass? |`)
  lines.push(`|--------|-------|-----------|-------|`)

  const costPass = agg.costDeltaWithin2PctPct !== null && agg.costDeltaWithin2PctPct >= 99.5
  lines.push(`| Cost delta — % runs within ±2% | ${fmtPct(agg.costDeltaWithin2PctPct)} | >99.5% | ${costPass ? '✅' : '❌'} |`)
  lines.push(`| Cost delta — median | ${fmtDelta(agg.costDeltaMedian)} | — | — |`)
  lines.push(`| Cost delta — p95 (abs) | ${fmt(agg.costDeltaP95 !== null ? agg.costDeltaP95 * 100 : null, 2, '%')} | ±2% | ${(agg.costDeltaP95 ?? 0) <= 0.02 ? '✅' : '❌'} |`)
  lines.push(`| Cost delta — p99 (abs) | ${fmt(agg.costDeltaP99 !== null ? agg.costDeltaP99 * 100 : null, 2, '%')} | — | — |`)

  const successPass = agg.pipelineSuccessRate >= 99.9
  lines.push(`| Pipeline success rate | ${fmtPct(agg.pipelineSuccessRate)} | >99.9% | ${successPass ? '✅' : '❌'} |`)

  const bothPdfsPass = agg.bothPdfsSuccessRate >= 99.9
  lines.push(`| Both-PDF write success rate | ${fmtPct(agg.bothPdfsSuccessRate)} | >99.9% | ${bothPdfsPass ? '✅' : '❌'} |`)

  const latencyPass = agg.latencyRatioP95 === null || agg.latencyRatioP95 <= 1.2
  lines.push(`| Latency ratio — median | ${fmt(agg.latencyRatioMedian !== null ? agg.latencyRatioMedian * 100 : null, 0, '%')} | ≤120% | — |`)
  lines.push(`| Latency ratio — p95 | ${fmt(agg.latencyRatioP95 !== null ? agg.latencyRatioP95 * 100 : null, 0, '%')} | ≤120% | ${latencyPass ? '✅' : '❌'} |`)
  lines.push(`| Latency ratio — max | ${fmt(agg.latencyRatioMax !== null ? agg.latencyRatioMax * 100 : null, 0, '%')} | — | — |`)

  const grammarPass = agg.grammarFiringRate > 10
  lines.push(`| Grammar firing rate (≥1 WARN/BLOCK) | ${fmtPct(agg.grammarFiringRate)} | >10% | ${grammarPass ? '✅' : '❌'} |`)

  lines.push(`| Avg verified-MPN% | ${fmtPct(agg.avgVerifiedMpnPct)} | informational | — |`)
  lines.push(`| Avg data-gap% | ${fmtPct(agg.avgDataGapPct)} | informational | — |`)
  lines.push(``)

  // Per-class breakdown
  lines.push(`## Per-Class Breakdown`)
  lines.push(``)
  lines.push(`| Class | n | Cost Δ median | Cost Δ p95 | Success | Both PDFs | Grammar | Verified% | Data-gap% |`)
  lines.push(`|-------|---|--------------|------------|---------|-----------|---------|-----------|-----------|`)

  const sortedClasses = Array.from(perClassAgg.entries()).sort(([, a], [, b]) => {
    // Sort by cost delta p95 ascending (lowest divergence = most ready)
    const ap = a.costDeltaP95 ?? Infinity
    const bp = b.costDeltaP95 ?? Infinity
    return ap - bp
  })

  for (const [cls, clsAgg] of sortedClasses) {
    const clsMetrics = perClassMetrics.get(cls) ?? []
    lines.push(
      `| ${cls} ` +
      `| ${clsAgg.totalRuns} ` +
      `| ${fmtDelta(clsAgg.costDeltaMedian)} ` +
      `| ${fmt(clsAgg.costDeltaP95 !== null ? clsAgg.costDeltaP95 * 100 : null, 2, '%')} ` +
      `| ${fmtPct(clsAgg.pipelineSuccessRate)} ` +
      `| ${fmtPct(clsAgg.bothPdfsSuccessRate)} ` +
      `| ${fmtPct(clsAgg.grammarFiringRate)} ` +
      `| ${fmtPct(clsAgg.avgVerifiedMpnPct)} ` +
      `| ${fmtPct(clsAgg.avgDataGapPct)} |`
    )
  }
  lines.push(``)

  // Per-run detail
  lines.push(`## Per-Run Detail`)
  lines.push(``)
  lines.push(`| Slug | Class | OK | Cost Δ | Both PDFs | Latency ratio | Grammar | Verified | DataGap | Error |`)
  lines.push(`|------|-------|----|--------|-----------|---------------|---------|----------|---------|-------|`)

  for (const m of metrics) {
    lines.push(
      `| ${m.slug} ` +
      `| ${m.productClass} ` +
      `| ${m.ok ? '✅' : '❌'} ` +
      `| ${fmtDelta(m.costDeltaFraction)} ` +
      `| ${m.bothPdfsOk ? '✅' : '❌'} ` +
      `| ${m.latencyRatio !== null ? `${(m.latencyRatio * 100).toFixed(0)}%` : 'N/A'} ` +
      `| ${m.grammarFired ? '✅ FIRED' : '—'} ` +
      `| ${fmtPct(m.verifiedMpnPct)} ` +
      `| ${fmtPct(m.dataGapPct)} ` +
      `| ${m.errorReason ?? '—'} |`
    )
  }
  lines.push(``)

  // Failed runs detail
  const failed = metrics.filter(m => !m.ok)
  if (failed.length > 0) {
    lines.push(`## Failed Runs`)
    lines.push(``)
    for (const f of failed) {
      lines.push(`### ${f.slug}`)
      lines.push(``)
      lines.push(`- **Product class:** ${f.productClass}`)
      lines.push(`- **Reason:** ${f.errorReason ?? 'unknown — check log.txt'}`)
      lines.push(``)
    }
  }

  // Readiness ranking
  lines.push(`## Cutover Readiness Ranking`)
  lines.push(``)
  lines.push(`Classes sorted by cost delta p95 ascending (lowest divergence = most ready first):`)
  lines.push(``)
  for (const [i, [cls, clsAgg]] of sortedClasses.entries()) {
    const costWithin = clsAgg.costDeltaWithin2PctPct ?? 0
    const status = costWithin >= 99.5 && clsAgg.pipelineSuccessRate >= 99.9
      ? 'READY'
      : costWithin >= 90
      ? 'CLOSE'
      : 'NOT READY'
    lines.push(`${i + 1}. **${cls}** — cost p95=${fmt(clsAgg.costDeltaP95 !== null ? clsAgg.costDeltaP95 * 100 : null, 2, '%')}, within±2%=${fmtPct(clsAgg.costDeltaWithin2PctPct)}, status=${status}`)
  }
  lines.push(``)

  // Methodology note
  lines.push(`## Methodology`)
  lines.push(``)
  lines.push(`- **Cost delta** = \`(radicalCostSummary.bomTotal - legacyCostBomTotal) / legacyCostBomTotal\``)
  lines.push(`- **Pipeline success rate** = % runs where \`.done\` sentinel was written and \`ok=true\``)
  lines.push(`- **Both-PDF rate** = % successful runs where both \`report.pdf\` and \`radical.pdf\` exist with size >0`)
  lines.push(`- **Latency ratio** = Phase 5 render time / primary PDF render time (from run-manifest.json)`)
  lines.push(`- **Grammar firing rate** = % runs where ≥1 WARN or BLOCK verdict fires`)
  lines.push(`- **Verified-MPN%** = \`verified_by_distributor / total_leaves\` from resolution_meta.stats`)
  lines.push(`- **Data-gap%** = \`data_gap / total_leaves\` from resolution_meta.stats`)
  lines.push(``)
  lines.push(`All data sourced from \`run-manifest.json\` + \`state.json\` per run directory.`)
  lines.push(`Latency data is only available when the batch runner writes timing into \`run-manifest.json\`.`)

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx src/lib/pdf-engine-v2/eval-harness/shadow-mode-aggregator.ts <evidence-dir>')
    console.error('Example: npx tsx ... ~/Downloads/engine-evidence/radical-shadow-20260510T1234/')
    process.exit(1)
  }

  const evidenceDir = resolve(args[0])
  console.log(`[aggregator] Reading evidence from: ${evidenceDir}`)

  const runs = loadRunResults(evidenceDir)

  if (runs.length === 0) {
    console.error('[aggregator] No completed runs found in evidence directory.')
    process.exit(1)
  }

  const metrics = runs.map(extractRunMetrics)

  // Per-class grouping
  const perClassMetrics = new Map<string, RunMetrics[]>()
  for (const m of metrics) {
    const cls = m.productClass
    if (!perClassMetrics.has(cls)) perClassMetrics.set(cls, [])
    perClassMetrics.get(cls)!.push(m)
  }

  const perClassAgg = new Map<string, AggregateMetrics>()
  for (const [cls, clsMetrics] of perClassMetrics) {
    perClassAgg.set(cls, aggregate(clsMetrics))
  }

  const agg = aggregate(metrics)
  const verdict = determineCutoverReadiness(agg, perClassAgg)

  console.log(`[aggregator] Cutover verdict: ${verdict.verdict}`)
  if (verdict.blockers.length > 0) {
    console.log(`[aggregator] Blockers:`)
    for (const b of verdict.blockers) {
      console.log(`  - ${b}`)
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportContent = generateReport(
    evidenceDir,
    runs,
    metrics,
    agg,
    perClassMetrics,
    perClassAgg,
    verdict,
    new Date().toISOString(),
  )

  // Determine where to write the report.
  // Prefer the eval-harness directory (co-located with this script), resolved via
  // import.meta.url when available (ESM / tsx). Fall back to writing alongside the
  // evidence directory so the report is always near the data it describes.
  let reportPath: string
  try {
    // ESM path: import.meta.url is always available under tsx
    // Use fileURLToPath to handle URL-encoded characters (e.g. spaces) in the path
    const scriptDir = fileURLToPath(new URL('.', import.meta.url))
    reportPath = join(scriptDir, `shadow-mode-report-${timestamp}.md`)
  } catch {
    reportPath = join(evidenceDir, `shadow-mode-report-${timestamp}.md`)
  }

  writeFileSync(reportPath, reportContent, 'utf-8')
  console.log(`[aggregator] Report written → ${reportPath}`)
}

main().catch(err => {
  console.error('[aggregator] Fatal error:', err)
  process.exit(1)
})
