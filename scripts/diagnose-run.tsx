#!/usr/bin/env npx tsx
/**
 * @file diagnose-run.tsx — Diagnostic CLI for ForgeOS pdf-engine-v2 action logs.
 *
 * Reads `actions.jsonl` from an iter output directory and produces a
 * human-readable timeline report: what changed, when, by whom, why.
 *
 * Usage:
 *   npx tsx scripts/diagnose-run.tsx <iter-dir>
 *   npx tsx scripts/diagnose-run.tsx <iter-dir> --json
 *   npx tsx scripts/diagnose-run.tsx <iter-dir> --anomalies-only
 *
 * Spec: CLAUDE.md "Engine action logs — REQUIRED for diagnosis" (Tristan, 2026-05-14).
 *
 * Sections:
 *   1. Header        — dir, run start/end, wall-clock, total LLM cost in GBP
 *   2. Timeline      — one line per action in time order
 *   3. Cost by model — model | calls | tokens | cost in GBP, sorted by cost desc
 *   4. Stage durations — stage | start | end | duration | outcome | cost in GBP
 *   5. Anomalies     — counter regressions, truncations, gate loops, latency outliers
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const iterDir = args.find(a => !a.startsWith('--'))
const flagJson = args.includes('--json')
const flagAnomaliesOnly = args.includes('--anomalies-only')

if (!iterDir) {
  console.error('Usage: npx tsx scripts/diagnose-run.tsx <iter-dir> [--json] [--anomalies-only]')
  process.exit(1)
}

const absDir = resolve(iterDir)
const logPath = join(absDir, 'actions.jsonl')

if (!existsSync(absDir)) {
  console.error(`Directory not found: ${absDir}`)
  process.exit(1)
}

if (!existsSync(logPath)) {
  console.log(`No action log found in ${absDir}; pipeline likely crashed before logger initialised`)
  process.exit(0)
}

// ─── Types (mirrors action-logger.ts) ────────────────────────────────────────

interface BaseRecord {
  timestamp?: string
  step_name: string
  action_type: string
  [key: string]: unknown
}

interface LlmRecord extends BaseRecord {
  action_type: 'llm_call'
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  tokens_in?: number
  tokens_out?: number
  latency_ms?: number
  finish_reason?: string
  cost_usd?: number
  ok?: boolean
  error?: string
}

interface GateRecord extends BaseRecord {
  action_type: 'gate_evaluation'
  gate_name?: string
  verdict?: string
  score?: number
  reasons?: string[]
}

interface RepairRecord extends BaseRecord {
  action_type: 'state_repair'
  target_field?: string
  before_value?: unknown
  after_value?: unknown
  before_hash?: string
  after_hash?: string
  key_changes?: string
}

interface StageRecord extends BaseRecord {
  action_type: 'stage_start' | 'stage_end'
  outcome?: string
  duration_ms?: number
  error?: string
}

type AnyRecord = LlmRecord | GateRecord | RepairRecord | StageRecord | BaseRecord

// ─── Load and parse JSONL ─────────────────────────────────────────────────────

const rawLines = readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim())
const records: AnyRecord[] = []

for (let i = 0; i < rawLines.length; i++) {
  try {
    records.push(JSON.parse(rawLines[i]) as AnyRecord)
  } catch {
    console.warn(`[diagnose-run] Skipped malformed JSON on line ${i + 1}: ${rawLines[i].slice(0, 80)}`)
  }
}

if (records.length === 0) {
  console.log(`Action log exists but contains no parseable records in ${absDir}`)
  process.exit(0)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GBP_PER_USD = 0.79

/** Format milliseconds as a human-readable duration string. */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m${secs}s`
}

/** Extract HH:MM:SS from an ISO timestamp string. */
function fmtTime(ts: string | undefined): string {
  if (!ts) return '??:??:??'
  try {
    return new Date(ts).toISOString().slice(11, 19)
  } catch {
    return '??:??:??'
  }
}

/** Left-align a string to a fixed column width. */
function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length)
}

/** Right-align a number to a fixed column width. */
function rpad(n: number, width: number): string {
  const s = String(n)
  return s.length >= width ? s : ' '.repeat(width - s.length) + s
}

/** Format a USD amount as GBP with a pound-sign prefix. */
function fmtGbp(usd: number | undefined): string {
  if (usd == null) return '   —    '
  const gbp = usd * GBP_PER_USD
  if (gbp < 0.001) return `£${gbp.toFixed(6)}`
  if (gbp < 0.01) return `£${gbp.toFixed(5)}`
  return `£${gbp.toFixed(4)}`
}

/** Truncate a string to maxLen chars, appending ellipsis if truncated. */
function trunc(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}

/** Sum cost_usd across all records, skipping undefined. */
function totalCostUsd(recs: AnyRecord[]): number {
  return recs.reduce((acc, r) => {
    const c = (r as LlmRecord).cost_usd
    return acc + (typeof c === 'number' ? c : 0)
  }, 0)
}

/**
 * Parse numeric change pairs from key_changes strings.
 * Handles "cell_count: 4900 → 3500" and "foo: 4900->3500".
 */
function extractKeyChangePairs(kc: string): Array<{ key: string; before: number; after: number }> {
  const pattern = /(\w+):\s*([\d.]+)\s*[→>-]+\s*([\d.]+)/g
  const results: Array<{ key: string; before: number; after: number }> = []
  let m
  while ((m = pattern.exec(kc)) !== null) {
    results.push({ key: m[1], before: Number(m[2]), after: Number(m[3]) })
  }
  return results
}

// ─── Compute wall-clock deltas ─────────────────────────────────────────────────

const timestamps = records.map(r => r.timestamp ? new Date(r.timestamp).getTime() : NaN)

function deltaMsFrom(idx: number): number | undefined {
  if (idx === 0) return undefined
  const cur = timestamps[idx]
  const prev = timestamps[idx - 1]
  if (isNaN(cur) || isNaN(prev)) return undefined
  return cur - prev
}

// ─── Section 1: Header ────────────────────────────────────────────────────────

const firstTs = records[0]?.timestamp
const lastTs = records[records.length - 1]?.timestamp
const wallMs = (firstTs && lastTs)
  ? new Date(lastTs).getTime() - new Date(firstTs).getTime()
  : undefined

const totalUsd = totalCostUsd(records)
const totalGbp = totalUsd * GBP_PER_USD

function buildHeader(): string {
  const lines: string[] = []
  lines.push('═'.repeat(80))
  lines.push('ForgeOS PDF Engine v2 — Run Diagnostic')
  lines.push(`  Dir      : ${absDir}`)
  lines.push(`  Started  : ${firstTs ?? '(unknown)'}`)
  lines.push(`  Ended    : ${lastTs ?? '(unknown)'}`)
  lines.push(`  Wall     : ${wallMs != null ? fmtMs(wallMs) : '(unknown)'}`)
  lines.push(`  LLM cost : £${totalGbp.toFixed(4)} (${records.filter(r => r.action_type === 'llm_call').length} LLM calls, ${records.length} records total)`)
  lines.push('═'.repeat(80))
  return lines.join('\n')
}

// ─── Section 2: Timeline ─────────────────────────────────────────────────────

function buildTimeline(): string {
  const lines: string[] = []
  lines.push('\n── TIMELINE ──────────────────────────────────────────────────────────────────')

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const ts = fmtTime(r.timestamp)
    const dms = deltaMsFrom(i)
    const deltaStr = dms != null ? `+${fmtMs(dms)}` : ''
    const stepCol = pad(r.step_name ?? '', 32)
    const deltaCol = pad(deltaStr, 9)

    let detail = ''

    if (r.action_type === 'llm_call') {
      const lr = r as LlmRecord
      const model = trunc(lr.model ?? '(unknown model)', 28)
      const fin = lr.finish_reason ?? '?'
      const ti = lr.prompt_tokens ?? lr.tokens_in ?? 0
      const to = lr.completion_tokens ?? lr.tokens_out ?? 0
      const latStr = lr.latency_ms != null ? fmtMs(lr.latency_ms) : '?'
      const costStr = lr.cost_usd != null ? ` ${fmtGbp(lr.cost_usd)}` : ''
      const errStr = lr.ok === false ? ` ERR:${trunc(lr.error ?? '', 40)}` : ''
      detail = `llm  ${pad(model, 30)} fin=${fin} in=${ti} out=${to} lat=${latStr}${costStr}${errStr}`

    } else if (r.action_type === 'gate_evaluation') {
      const gr = r as GateRecord
      const gateName = trunc(gr.gate_name ?? '(unnamed gate)', 28)
      const verdict = gr.verdict ?? '?'
      const scoreStr = gr.score != null ? ` score=${gr.score}` : ''
      const reasonStr = gr.reasons?.length
        ? ` | ${trunc(gr.reasons.slice(0, 2).join('; '), 60)}`
        : ''
      detail = `gate ${pad(gateName, 30)} ${verdict}${scoreStr}${reasonStr}`

    } else if (r.action_type === 'state_repair') {
      const rr = r as RepairRecord
      const field = trunc(rr.target_field ?? '(unknown field)', 24)
      const kc = rr.key_changes ?? ''
      const hashes = (rr.before_hash && rr.after_hash)
        ? ` [${rr.before_hash}→${rr.after_hash}]`
        : ''
      detail = `repair ${pad(field, 26)} ${trunc(kc, 50)}${hashes}`

    } else if (r.action_type === 'stage_start') {
      const sr = r as StageRecord
      detail = `stage_start${sr.outcome ? ` outcome=${sr.outcome}` : ''}`

    } else if (r.action_type === 'stage_end') {
      const sr = r as StageRecord
      const durationStr = sr.duration_ms != null ? ` dur=${fmtMs(sr.duration_ms)}` : ''
      const outcomeStr = sr.outcome ? ` outcome=${sr.outcome}` : ''
      const errStr = sr.error ? ` ERR:${trunc(sr.error, 50)}` : ''
      detail = `stage_end${outcomeStr}${durationStr}${errStr}`

    } else if (r.action_type === 'init') {
      const extra = Object.entries(r)
        .filter(([k]) => !['timestamp', 'step_name', 'action_type', 'step'].includes(k))
        .slice(0, 3)
        .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
        .join(' ')
      detail = `init  ${extra}`

    } else if (r.action_type === 'note') {
      const extras = Object.entries(r)
        .filter(([k]) => !['timestamp', 'step_name', 'action_type', 'step'].includes(k))
        .slice(0, 4)
        .map(([k, v]) => {
          const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30)
          return `${k}=${val}`
        })
        .join(' ')
      detail = `note  ${trunc(extras, 72)}`

    } else {
      detail = `${r.action_type}`
    }

    lines.push(`${ts}  ${deltaCol}  ${stepCol}  ${detail}`)
  }

  return lines.join('\n')
}

// ─── Section 3: Cost breakdown by model ──────────────────────────────────────

interface ModelRow {
  model: string
  calls: number
  tokensIn: number
  tokensOut: number
  costUsd: number
}

function buildCostBreakdown(): string {
  const map = new Map<string, ModelRow>()

  for (const r of records) {
    if (r.action_type !== 'llm_call') continue
    const lr = r as LlmRecord
    const model = lr.model ?? '(unknown)'
    const ti = lr.prompt_tokens ?? lr.tokens_in ?? 0
    const to = lr.completion_tokens ?? lr.tokens_out ?? 0
    const cost = lr.cost_usd ?? 0

    const existing = map.get(model) ?? { model, calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 }
    existing.calls++
    existing.tokensIn += ti
    existing.tokensOut += to
    existing.costUsd += cost
    map.set(model, existing)
  }

  const rows = [...map.values()].sort((a, b) => b.costUsd - a.costUsd)
  if (rows.length === 0) return ''

  const lines: string[] = []
  lines.push('\n── COST BY MODEL ─────────────────────────────────────────────────────────────')
  lines.push(`${pad('Model', 38)}  ${pad('Calls', 5)}  ${pad('Tok In', 10)}  ${pad('Tok Out', 10)}  Cost`)
  lines.push('─'.repeat(80))

  for (const row of rows) {
    lines.push(
      `${pad(row.model, 38)}  ${rpad(row.calls, 5)}  ${rpad(row.tokensIn, 10)}  ${rpad(row.tokensOut, 10)}  ${fmtGbp(row.costUsd)}`
    )
  }

  const totalIn = rows.reduce((a, r) => a + r.tokensIn, 0)
  const totalOut = rows.reduce((a, r) => a + r.tokensOut, 0)
  const totalCalls = rows.reduce((a, r) => a + r.calls, 0)
  lines.push('─'.repeat(80))
  lines.push(`${pad('TOTAL', 38)}  ${rpad(totalCalls, 5)}  ${rpad(totalIn, 10)}  ${rpad(totalOut, 10)}  ${fmtGbp(totalUsd)}`)

  return lines.join('\n')
}

// ─── Section 4: Stage durations ──────────────────────────────────────────────

interface StageRow {
  name: string
  startTs: string
  endTs?: string
  durationMs?: number
  outcome?: string
  costUsd: number
}

function buildStageDurations(): string {
  const rows: StageRow[] = []
  // Track open stages by step_name.
  const openStages = new Map<string, StageRow>()

  for (const r of records) {
    if (r.action_type === 'stage_start') {
      const sr = r as StageRecord
      openStages.set(sr.step_name, {
        name: sr.step_name,
        startTs: sr.timestamp ?? '',
        costUsd: 0,
      })
    } else if (r.action_type === 'stage_end') {
      const sr = r as StageRecord
      const open = openStages.get(sr.step_name)
      if (open) {
        open.endTs = sr.timestamp
        open.outcome = sr.outcome
        // Prefer the authoritative duration_ms from the stage_end record.
        if (sr.duration_ms != null) {
          open.durationMs = sr.duration_ms
        } else if (open.startTs && sr.timestamp) {
          open.durationMs = new Date(sr.timestamp).getTime() - new Date(open.startTs).getTime()
        }
        rows.push(open)
        openStages.delete(sr.step_name)
      }
    }
  }

  // Any stages still open (run crashed mid-stage) — include as partial.
  for (const [, open] of openStages) {
    open.outcome = 'incomplete'
    rows.push(open)
  }

  // Accumulate LLM costs per stage using timestamp windows.
  for (const r of records) {
    if (r.action_type !== 'llm_call') continue
    const lr = r as LlmRecord
    if (!lr.timestamp || lr.cost_usd == null) continue
    const callTs = new Date(lr.timestamp).getTime()
    for (const row of rows) {
      const start = row.startTs ? new Date(row.startTs).getTime() : NaN
      const end = row.endTs ? new Date(row.endTs).getTime() : Infinity
      if (!isNaN(start) && callTs >= start && callTs < end) {
        row.costUsd += lr.cost_usd
        break
      }
    }
  }

  rows.sort((a, b) => {
    const at = a.startTs ? new Date(a.startTs).getTime() : 0
    const bt = b.startTs ? new Date(b.startTs).getTime() : 0
    return at - bt
  })

  if (rows.length === 0) return ''

  const lines: string[] = []
  lines.push('\n── STAGE DURATIONS ───────────────────────────────────────────────────────────')
  lines.push(`${pad('Stage', 32)}  ${pad('Start', 8)}  ${pad('End', 8)}  ${pad('Duration', 10)}  ${pad('Outcome', 10)}  Cost`)
  lines.push('─'.repeat(88))

  for (const row of rows) {
    const startStr = fmtTime(row.startTs)
    const endStr = row.endTs ? fmtTime(row.endTs) : '(open) '
    const durStr = row.durationMs != null ? fmtMs(row.durationMs) : '?'
    const outcome = row.outcome ?? '?'
    lines.push(
      `${pad(row.name, 32)}  ${startStr}  ${endStr}  ${pad(durStr, 10)}  ${pad(outcome, 10)}  ${fmtGbp(row.costUsd)}`
    )
  }

  return lines.join('\n')
}

// ─── Section 5: Anomalies ─────────────────────────────────────────────────────

interface Anomaly {
  severity: 'WARN' | 'ERROR'
  category: string
  message: string
  record_index: number
}

// Numeric counters that should never decrease in a healthy run.
const COUNTER_FIELDS = ['cell_count', 'sub_module_count', 'bom_lines_count', 'modules', 'sub_modules', 'words']

function buildAnomalies(): { anomalies: Anomaly[]; text: string } {
  const anomalies: Anomaly[] = []

  // Compute p95 latency across all LLM calls for outlier detection.
  const llmLatencies = records
    .filter(r => r.action_type === 'llm_call')
    .map(r => (r as LlmRecord).latency_ms)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)

  const p95 = llmLatencies.length > 1
    ? llmLatencies[Math.floor(llmLatencies.length * 0.95)]
    : undefined

  // Track last gate FAIL index per gate_name for oscillation detection.
  const lastGateFail = new Map<string, number>()

  for (let i = 0; i < records.length; i++) {
    const r = records[i]

    // --- Repair: counter going backwards ---
    if (r.action_type === 'state_repair') {
      const rr = r as RepairRecord
      if (rr.key_changes) {
        const pairs = extractKeyChangePairs(rr.key_changes)
        for (const { key, before, after } of pairs) {
          if (COUNTER_FIELDS.includes(key) && after < before) {
            anomalies.push({
              severity: 'ERROR',
              category: 'counter_regression',
              message: `[${fmtTime(r.timestamp)}] step="${r.step_name}": ${key} decreased ${before} → ${after} (key_changes)`,
              record_index: i,
            })
          }
        }
      }
      // Also check bare numeric before_value / after_value on known counter fields.
      const bv = typeof rr.before_value === 'number' ? rr.before_value : undefined
      const av = typeof rr.after_value === 'number' ? rr.after_value : undefined
      const field = rr.target_field ?? ''
      if (bv != null && av != null && av < bv && COUNTER_FIELDS.some(f => field.includes(f))) {
        anomalies.push({
          severity: 'ERROR',
          category: 'counter_regression',
          message: `[${fmtTime(r.timestamp)}] step="${r.step_name}": ${field} decreased ${bv} → ${av} (before/after_value)`,
          record_index: i,
        })
      }
    }

    // --- LLM truncation (finish_reason=length) ---
    if (r.action_type === 'llm_call') {
      const lr = r as LlmRecord
      if (lr.finish_reason === 'length') {
        anomalies.push({
          severity: 'ERROR',
          category: 'truncation',
          message: `[${fmtTime(r.timestamp)}] step="${r.step_name}" model=${lr.model ?? '?'}: finish_reason=length — response truncated`,
          record_index: i,
        })
      }
      // Latency outlier: single step > 2x p95.
      if (p95 != null && lr.latency_ms != null && lr.latency_ms > 2 * p95) {
        anomalies.push({
          severity: 'WARN',
          category: 'latency_outlier',
          message: `[${fmtTime(r.timestamp)}] step="${r.step_name}" model=${lr.model ?? '?'}: latency ${fmtMs(lr.latency_ms)} > 2x p95 (${fmtMs(p95)})`,
          record_index: i,
        })
      }
      // Expensive single call (> £1).
      if (lr.cost_usd != null && lr.cost_usd * GBP_PER_USD > 1.0) {
        anomalies.push({
          severity: 'WARN',
          category: 'expensive_call',
          message: `[${fmtTime(r.timestamp)}] step="${r.step_name}" model=${lr.model ?? '?'}: single call cost ${fmtGbp(lr.cost_usd)} (> £1 threshold)`,
          record_index: i,
        })
      }
    }

    // --- Gate FAIL followed by another FAIL on same gate (loop / oscillation) ---
    if (r.action_type === 'gate_evaluation') {
      const gr = r as GateRecord
      const gname = gr.gate_name ?? ''
      const verdict = (gr.verdict ?? '').toUpperCase()
      if (verdict === 'FAIL') {
        const lastIdx = lastGateFail.get(gname)
        if (lastIdx != null) {
          anomalies.push({
            severity: 'WARN',
            category: 'gate_oscillation',
            message: `[${fmtTime(r.timestamp)}] gate="${gname}": repeated FAIL (also at record #${lastIdx + 1}) — possible loop`,
            record_index: i,
          })
        }
        lastGateFail.set(gname, i)
      }
    }

    // --- Stage failures ---
    if (r.action_type === 'stage_end') {
      const sr = r as StageRecord
      if (sr.outcome === 'fail' || sr.error) {
        anomalies.push({
          severity: 'ERROR',
          category: 'stage_failure',
          message: `[${fmtTime(r.timestamp)}] stage="${r.step_name}": ended with failure — ${sr.error ? trunc(sr.error, 100) : 'outcome=fail'}`,
          record_index: i,
        })
      }
    }
  }

  const lines: string[] = []
  lines.push('\n── ANOMALIES ─────────────────────────────────────────────────────────────────')

  if (anomalies.length === 0) {
    lines.push('  No anomalies detected.')
  } else {
    lines.push(`  ${anomalies.length} anomaly/anomalies found:\n`)
    for (const a of anomalies) {
      const sev = a.severity === 'ERROR' ? '[ERROR]' : '[WARN] '
      lines.push(`  ${sev} [${a.category}] ${a.message}`)
    }
  }

  return { anomalies, text: lines.join('\n') }
}

// ─── JSON output mode ─────────────────────────────────────────────────────────

function buildJson(anomalies: Anomaly[]): object {
  const modelMap = new Map<string, { calls: number; tokensIn: number; tokensOut: number; costUsd: number }>()
  for (const r of records) {
    if (r.action_type !== 'llm_call') continue
    const lr = r as LlmRecord
    const model = lr.model ?? '(unknown)'
    const ti = lr.prompt_tokens ?? lr.tokens_in ?? 0
    const to = lr.completion_tokens ?? lr.tokens_out ?? 0
    const cost = lr.cost_usd ?? 0
    const ex = modelMap.get(model) ?? { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 }
    ex.calls++; ex.tokensIn += ti; ex.tokensOut += to; ex.costUsd += cost
    modelMap.set(model, ex)
  }

  return {
    iter_dir: absDir,
    start_timestamp: firstTs,
    end_timestamp: lastTs,
    wall_ms: wallMs,
    total_cost_usd: totalUsd,
    total_cost_gbp: totalGbp,
    record_count: records.length,
    anomaly_count: anomalies.length,
    anomalies,
    cost_by_model: Object.fromEntries(
      [...modelMap.entries()]
        .sort((a, b) => b[1].costUsd - a[1].costUsd)
        .map(([model, v]) => [model, { ...v, cost_gbp: v.costUsd * GBP_PER_USD }])
    ),
    timeline: records,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { anomalies, text: anomalyText } = buildAnomalies()

if (flagJson) {
  console.log(JSON.stringify(buildJson(anomalies), null, 2))
  process.exit(0)
}

if (flagAnomaliesOnly) {
  console.log(buildHeader())
  console.log(anomalyText)
  process.exit(0)
}

console.log(buildHeader())
console.log(buildTimeline())
console.log(buildCostBreakdown())
console.log(buildStageDurations())
console.log(anomalyText)
console.log()
