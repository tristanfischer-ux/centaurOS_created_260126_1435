/**
 * @file action-logger.ts — Append-only structured action log for engine runs.
 *
 * Spec source: ~/.claude/CLAUDE.md "Engine action logs — REQUIRED for diagnosis"
 * (Tristan, 2026-05-14).
 *
 * Every engine run that wants diagnosis MUST emit an `actions.jsonl` to its
 * iter output dir. Each line is one JSON record. Records carry — per CLAUDE.md:
 *
 *   - timestamp        ISO 8601, ALWAYS present
 *   - step_name        free-form stage identifier (e.g. 'research', 'STEP 5 R1 Grok')
 *   - action_type      'llm_call' | 'gate_evaluation' | 'state_repair' |
 *                      'stage_start' | 'stage_end' | 'init' | 'note'
 *
 *   For LLM calls:
 *     - model            OpenRouter slug (e.g. 'xiaomi/mimo-v2.5-pro')
 *     - finish_reason    'stop' | 'length' | 'tool_use' | …
 *     - tokens_in        prompt_tokens
 *     - tokens_out       completion_tokens
 *     - cost_usd         best-effort estimate from PRICING_USD_PER_M_TOKENS
 *     - latency_ms       wall-clock duration in ms
 *
 *   For gate verdicts:
 *     - gate_name        'physics_ledger' | 'compliance_gate' | 'council_scorer:<section>' …
 *     - verdict          'PASS' | 'WARN' | 'HALT' | 'FAIL' | …
 *     - score            optional numeric score (1-10 for council, deviation pct for cost, …)
 *     - reasons          string[] of human-readable verdict reasons
 *
 *   For state repairs:
 *     - target_field     dotted-path of the field being repaired (e.g. 'state.bomLines')
 *     - before_value     summary value BEFORE the repair (a number or short string)
 *     - after_value      summary value AFTER the repair
 *     - before_hash      sha256 of JSON.stringify(beforeObject), first 12 chars
 *     - after_hash       sha256 of JSON.stringify(afterObject), first 12 chars
 *     - key_changes      free-form string e.g. 'cell_count: 4900 → 3500'
 *
 * Best-effort: no throw on failure. If the file is unwritable, we
 * console.warn ONCE and continue. The pipeline must never fail because
 * the action log can't be appended.
 *
 * Backward compat: this module is also imported by
 * `scripts/serial-design-chain-v2.tsx`, replacing its inline `logAction`.
 */

import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { createHash } from 'crypto'

// ─── Cost-estimation pricing table (USD per 1M tokens) ──────────────────
// Best-effort cost-attribution numbers. OpenRouter publishes per-model
// pricing in JSON at https://openrouter.ai/api/v1/models — this table is
// a snapshot for the models the engine commonly uses (2026-05-17).
//
// MISSING-FROM-TABLE => cost_usd is omitted from the record (NOT zero —
// we never fabricate). Council 2026-05-18 directive: "if the engine
// doesn't know the price, the field is null; never silently set to 0".
//
// Fields: [input_per_M, output_per_M] in USD.
const PRICING_USD_PER_M_TOKENS: Record<string, [number, number]> = {
  // Anthropic
  'anthropic/claude-haiku-4.5':            [1.00, 5.00],
  'anthropic/claude-sonnet-4-6':           [3.00, 15.00],
  'anthropic/claude-opus-4-7':             [15.00, 75.00],
  // OpenAI
  'openai/gpt-5.4':                        [3.00, 12.00],
  'openai/gpt-5.5':                        [5.00, 20.00],
  'openai/gpt-4.1-mini':                   [0.40, 1.60],
  // Google Gemini
  'google/gemini-3.1-pro-preview':         [3.50, 14.00],
  'google/gemini-3.1-flash-lite':          [0.10, 0.40],
  'google/gemini-2.5-flash':               [0.30, 1.20],
  'google/gemini-2.5-flash-lite':          [0.075, 0.30],
  // x-ai
  'x-ai/grok-4.3':                         [3.00, 12.00],
  // Zhipu
  'z-ai/glm-5.1':                          [0.60, 2.20],
  // Moonshot
  'moonshotai/kimi-k2.6':                  [0.40, 1.60],
  // Qwen / Alibaba
  'qwen/qwen3.6-max-preview':              [1.20, 4.80],
  'qwen/qwen3.5-405b':                     [1.50, 5.00],
  // DeepSeek
  'deepseek/deepseek-v4-pro':              [0.40, 1.20],
  'deepseek/deepseek-v4-flash':            [0.14, 0.28],
  // Xiaomi
  'xiaomi/mimo-v2.5-pro':                  [0.50, 2.00],
  // Minimax
  'minimax/minimax-m2.7':                  [0.40, 1.60],
}

/**
 * Best-effort cost estimator. Returns USD; caller stores as `cost_usd`.
 * `undefined` when the model is not in the pricing table — never zero.
 */
export function estimateCostUsd(
  model: string | undefined,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
): number | undefined {
  if (!model) return undefined
  const tbl = PRICING_USD_PER_M_TOKENS[model]
  if (!tbl) return undefined
  const ti = tokensIn ?? 0
  const to = tokensOut ?? 0
  if (ti === 0 && to === 0) return undefined
  const usd = (ti / 1_000_000) * tbl[0] + (to / 1_000_000) * tbl[1]
  // Round to 6 decimals (sub-microdollar precision is meaningless).
  return Math.round(usd * 1_000_000) / 1_000_000
}

/**
 * Stable 12-char sha256 prefix for state-repair before/after hashes.
 * Returns `''` on stringify failure (never throws).
 */
export function shortHash(value: unknown): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value ?? null)
    return createHash('sha256').update(s).digest('hex').slice(0, 12)
  } catch {
    return ''
  }
}

// ─── Record types ─────────────────────────────────────────────────────────

export type ActionType =
  | 'llm_call'
  | 'gate_evaluation'
  | 'state_repair'
  | 'stage_start'
  | 'stage_end'
  | 'init'
  | 'note'

export interface BaseActionRecord {
  timestamp?: string                   // auto-stamped on write
  step_name: string
  action_type: ActionType
  [key: string]: unknown
}

export interface LlmCallRecord extends BaseActionRecord {
  action_type: 'llm_call'
  model: string
  prompt_tokens?: number
  completion_tokens?: number
  tokens_in?: number                   // alias kept for backwards-compat with chain-v2
  tokens_out?: number                  // alias kept for backwards-compat with chain-v2
  latency_ms?: number
  finish_reason?: string
  cost_usd?: number
  ok?: boolean
  error?: string
}

export interface GateRecord extends BaseActionRecord {
  action_type: 'gate_evaluation'
  gate_name: string
  verdict: string
  score?: number
  reasons?: string[]
}

export interface RepairRecord extends BaseActionRecord {
  action_type: 'state_repair'
  target_field?: string
  before_value?: unknown
  after_value?: unknown
  before_hash?: string
  after_hash?: string
  key_changes?: string
}

export interface StageRecord extends BaseActionRecord {
  action_type: 'stage_start' | 'stage_end'
  outcome?: 'ok' | 'fail' | 'skipped'
  duration_ms?: number
  error?: string
}

// ─── ActionLogger class ────────────────────────────────────────────────────

export class ActionLogger {
  private logPath: string = ''
  private warned: boolean = false

  /**
   * Attach the logger to an iter dir. Creates the dir if missing and
   * truncates any existing `actions.jsonl` (so each run starts clean).
   *
   * If `iterDir` is falsy, the logger becomes a silent no-op (write-into-the-void).
   */
  attach(iterDir: string | undefined | null): void {
    if (!iterDir) {
      this.logPath = ''
      return
    }
    try {
      const dir = resolve(iterDir)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      this.logPath = resolve(dir, 'actions.jsonl')
      // Truncate so each run starts fresh.
      writeFileSync(this.logPath, '')
    } catch (err) {
      this.silentWarn('attach', err)
      this.logPath = ''
    }
  }

  /**
   * Returns true if the logger has a destination path. Useful for tests
   * + the chain-v2 backward-compat shim.
   */
  isAttached(): boolean {
    return !!this.logPath
  }

  /**
   * Low-level: write any record. Auto-stamps `timestamp`. Never throws.
   */
  log(record: BaseActionRecord & Record<string, unknown>): void {
    if (!this.logPath) return
    try {
      const stamped = { timestamp: new Date().toISOString(), ...record }
      appendFileSync(this.logPath, JSON.stringify(stamped) + '\n')
    } catch (err) {
      this.silentWarn('log', err)
    }
  }

  /** Log an LLM call. Computes `cost_usd` from the pricing table. */
  logLlm(opts: {
    step_name: string
    model: string
    prompt_tokens?: number
    completion_tokens?: number
    tokens_in?: number
    tokens_out?: number
    latency_ms?: number
    finish_reason?: string
    cost_usd?: number
    ok?: boolean
    error?: string
    [extra: string]: unknown
  }): void {
    const ti = opts.prompt_tokens ?? opts.tokens_in
    const to = opts.completion_tokens ?? opts.tokens_out
    const cost = opts.cost_usd ?? estimateCostUsd(opts.model, ti, to)
    this.log({
      step_name: opts.step_name,
      action_type: 'llm_call',
      model: opts.model,
      prompt_tokens: ti,
      completion_tokens: to,
      // Aliases kept so chain-v2 + new stages can both query a consistent key.
      tokens_in: ti,
      tokens_out: to,
      latency_ms: opts.latency_ms,
      finish_reason: opts.finish_reason,
      cost_usd: cost,
      ok: opts.ok,
      error: opts.error,
      ...Object.fromEntries(
        Object.entries(opts).filter(
          ([k]) => ![
            'step_name', 'model', 'prompt_tokens', 'completion_tokens',
            'tokens_in', 'tokens_out', 'latency_ms', 'finish_reason',
            'cost_usd', 'ok', 'error',
          ].includes(k),
        ),
      ),
    })
  }

  /** Log a gate verdict (council, physics ledger, compliance, etc.) */
  logGate(opts: {
    step_name: string
    gate_name: string
    verdict: string
    score?: number
    reasons?: string[]
    [extra: string]: unknown
  }): void {
    this.log({
      step_name: opts.step_name,
      action_type: 'gate_evaluation',
      gate_name: opts.gate_name,
      verdict: opts.verdict,
      score: opts.score,
      reasons: opts.reasons,
      ...Object.fromEntries(
        Object.entries(opts).filter(
          ([k]) => !['step_name', 'gate_name', 'verdict', 'score', 'reasons'].includes(k),
        ),
      ),
    })
  }

  /** Log a state mutation / repair. before_hash + after_hash auto-computed. */
  logRepair(opts: {
    step_name: string
    target_field?: string
    before_value?: unknown
    after_value?: unknown
    before_hash?: string
    after_hash?: string
    key_changes?: string
    [extra: string]: unknown
  }): void {
    const beforeHash = opts.before_hash ?? (opts.before_value !== undefined ? shortHash(opts.before_value) : undefined)
    const afterHash = opts.after_hash ?? (opts.after_value !== undefined ? shortHash(opts.after_value) : undefined)
    this.log({
      step_name: opts.step_name,
      action_type: 'state_repair',
      target_field: opts.target_field,
      before_value: opts.before_value,
      after_value: opts.after_value,
      before_hash: beforeHash,
      after_hash: afterHash,
      key_changes: opts.key_changes,
      ...Object.fromEntries(
        Object.entries(opts).filter(
          ([k]) => ![
            'step_name', 'target_field', 'before_value', 'after_value',
            'before_hash', 'after_hash', 'key_changes',
          ].includes(k),
        ),
      ),
    })
  }

  /** Log a stage boundary record (entry/exit). */
  logStage(opts: {
    step_name: string
    action_type: 'stage_start' | 'stage_end'
    outcome?: 'ok' | 'fail' | 'skipped'
    duration_ms?: number
    error?: string
    [extra: string]: unknown
  }): void {
    this.log({
      step_name: opts.step_name,
      action_type: opts.action_type,
      outcome: opts.outcome,
      duration_ms: opts.duration_ms,
      error: opts.error,
      ...Object.fromEntries(
        Object.entries(opts).filter(
          ([k]) => !['step_name', 'action_type', 'outcome', 'duration_ms', 'error'].includes(k),
        ),
      ),
    })
  }

  private silentWarn(op: string, err: unknown): void {
    if (this.warned) return
    this.warned = true
    try {
      // eslint-disable-next-line no-console
      console.warn(`[action-logger] ${op} failed (further warnings suppressed):`, String(err).slice(0, 200))
    } catch {
      /* swallow */
    }
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────
//
// Stages don't accept the logger as a parameter (that would require
// modifying ~25 function signatures across the engine). Instead, the
// pipeline entry-point (`runPipeline` or `chain-v2 main()`) calls
// `attachActionLogger(iterDir)` early, and stages call `getActionLogger()`
// to get a handle. When no pipeline has attached, `getActionLogger()`
// returns a silent stub — so legacy callers and unit tests stay
// behaviourally identical.

let _singleton: ActionLogger | null = null

/**
 * Attach the process-wide action logger to an iter dir.
 *
 * Idempotent: calling twice with the same dir creates a NEW logger
 * (truncates the file again). Tests rely on this.
 *
 * Passing undefined/null detaches.
 */
export function attachActionLogger(iterDir: string | undefined | null): ActionLogger {
  _singleton = new ActionLogger()
  _singleton.attach(iterDir)
  return _singleton
}

/**
 * Get the process-wide action logger. Returns a silent stub if none has
 * been attached — so stages can call `getActionLogger().logLlm({...})`
 * unconditionally.
 */
export function getActionLogger(): ActionLogger {
  if (!_singleton) {
    _singleton = new ActionLogger()  // un-attached → all writes are no-ops
  }
  return _singleton
}

/**
 * Detach the logger entirely. Used by tests / shutdown.
 */
export function detachActionLogger(): void {
  _singleton = null
}

// ─── Convenience helpers for one-liners ───────────────────────────────────

/**
 * Helper used by stages that wrap a single LLM call: extracts finish_reason +
 * tokens + cost from an OpenRouter response body + the latency, and logs.
 *
 * Non-throwing. Returns nothing.
 */
export function logOpenRouterCall(opts: {
  step_name: string
  model: string
  responseJson: any                    // the OpenRouter json response (may be undefined on error)
  latency_ms?: number
  ok?: boolean
  error?: string
  [extra: string]: unknown
}): void {
  const choice = opts.responseJson?.choices?.[0]
  const finishReason = choice?.finish_reason as string | undefined
  const promptTokens = opts.responseJson?.usage?.prompt_tokens as number | undefined
  const completionTokens = opts.responseJson?.usage?.completion_tokens as number | undefined
  getActionLogger().logLlm({
    step_name: opts.step_name,
    model: opts.model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    latency_ms: opts.latency_ms,
    finish_reason: finishReason,
    ok: opts.ok ?? !opts.error,
    error: opts.error,
    ...Object.fromEntries(
      Object.entries(opts).filter(
        ([k]) => !['step_name', 'model', 'responseJson', 'latency_ms', 'ok', 'error'].includes(k),
      ),
    ),
  })
}
