/**
 * lesson-loop.ts — the AUTOMATED lesson→rule loop (ForgeOS strengthening #1, 2026-06-24).
 *
 * The article's edge: "every loss writes a lesson, every lesson becomes a rule." ForgeOS
 * already has the verifier army (35 deterministic gates) and the invariant discipline
 * (every commit adds a regression-harness invariant) — but a HUMAN was the wire between a
 * gate failing and a rule existing. This closes that wire MECHANICALLY:
 *
 *   1. recordGateFailure() appends the loss to a CROSS-RUN failure-ledger.jsonl (the missing
 *      learning substrate — actions.jsonl is per-run; this survives across runs).
 *   2. It auto-DRAFTS a regression-harness invariant STUB from the gate's already-known
 *      fix-stage (drawing_gates emits GATE_STAGE; the punch-list already routes each defect
 *      to the stage that fixes it). The stub is a DRAFT a human/council confirms — it NEVER
 *      auto-mutates gate logic or the live harness (the safety line: drafts, not edits).
 *   3. When the SAME (class, gate) loss recurs (>=2x in the ledger), it flags ESCALATION —
 *      the MemPalace "Rule 2 pattern detector" pattern: a repeated loss is a pattern, not a
 *      one-off, and wants a coding-council, not another stub.
 *
 * Purely additive: it writes a ledger + draft files; it changes no gate verdict and blocks
 * nothing. Safe to call from any gate-failure site in the chain.
 */
import { appendFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { execFileSync } from 'child_process'
import { homedir } from 'os'

export interface FailureEntry {
  ts: string                    // ISO timestamp (caller-supplied so the module stays pure/testable)
  product_class: string
  gate: string                  // e.g. 'drawing:load_reconcile', 'scorecard_floor', 'exit:14'
  exit_code: number | null
  fix_stage: string | null      // GATE_STAGE — the engine stage that fixes this defect
  run_dir: string
  sha: string
  detail: string
}

// Cross-run learning state lives alongside the growing DB (forge-truth.db), NOT in the repo
// run dir — it must survive across runs + be queryable by the coverage heartbeat (#3).
export const DEFAULT_LEDGER = resolve(homedir(), '.forge-truth', 'failure-ledger.jsonl')
// Invariant stubs land in the repo (reviewable + promotable into regression-harness.tsx).
export const DEFAULT_STUB_DIR = resolve(__dirname, '..', '..', 'tasks', 'harness-stubs')

export function currentSha(): string {
  try {
    // execFileSync (no shell) with a fixed arg array — no interpolation, no injection surface.
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

function _slug(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
}

/** Append one loss to the cross-run failure-ledger (JSONL). Pure I/O; injectable path for tests. */
export function appendFailureLedger(entry: FailureEntry, ledgerPath: string = DEFAULT_LEDGER): void {
  mkdirSync(resolve(ledgerPath, '..'), { recursive: true })
  appendFileSync(ledgerPath, JSON.stringify(entry) + '\n')
}

/** How many times this (class, gate) loss already sits in the ledger (incl. the just-appended one). */
export function recurrenceCount(productClass: string, gate: string, ledgerPath: string = DEFAULT_LEDGER): number {
  if (!existsSync(ledgerPath)) return 0
  let n = 0
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line)
      if (e.product_class === productClass && e.gate === gate) n++
    } catch { /* skip malformed */ }
  }
  return n
}

/**
 * Draft a regression-harness invariant STUB for this loss (a DRAFT for a human/council to
 * confirm, never a live harness edit). Returns the stub file path. The stub names the
 * fix-stage the gate already routed to, so the human knows where the assertion belongs.
 */
export function draftInvariantStub(entry: FailureEntry, recurrence: number, stubDir: string = DEFAULT_STUB_DIR): string {
  mkdirSync(stubDir, { recursive: true })
  const id = `${_slug(entry.product_class).toUpperCase()}.${_slug(entry.gate)}_regression`
  const stubPath = resolve(stubDir, `${_slug(entry.product_class)}__${_slug(entry.gate)}.stub.tsx`)
  const body = [
    `// AUTO-DRAFTED regression-harness invariant stub — ${entry.ts}`,
    `// Origin: gate '${entry.gate}' FAILED on class '${entry.product_class}'` +
      (entry.exit_code != null ? ` (exit ${entry.exit_code})` : '') +
      (entry.fix_stage ? `, routed to fix-stage: ${entry.fix_stage}` : '') + `.`,
    `// Loss recurrence in the ledger: ${recurrence}${recurrence >= 2 ? '  ⚠ RECURRING — escalate to a coding-council, do not just stub.' : ''}`,
    `// Run: ${entry.run_dir}  @ ${entry.sha}`,
    `// Detail: ${entry.detail.replace(/\n/g, ' ').slice(0, 300)}`,
    `//`,
    `// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this`,
    `// at fix-stage '${entry.fix_stage ?? '?'}', then MOVE it into scripts/regression-harness.tsx`,
    `// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.`,
    `export const DRAFT_INVARIANT = {`,
    `  id: '${id}',`,
    `  description: "${entry.gate} must pass for ${entry.product_class} (auto-drafted from a real failure)",`,
    `  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage`,
    `  detail: 'STUB — implement from fix-stage ${entry.fix_stage ?? '?'} and promote into regression-harness.tsx',`,
    `}`,
    ``,
  ].join('\n')
  writeFileSync(stubPath, body)
  return stubPath
}

export interface RecordResult {
  recurrence: number
  escalate: boolean
  stubPath: string
  ledgerPath: string
}

/**
 * The one call a gate-failure site makes. Appends the loss, drafts the invariant stub, and
 * flags escalation when the same (class, gate) has now failed >=2x. Never throws on I/O
 * (a logging failure must never break the chain) — best-effort, returns what it could do.
 */
export function recordGateFailure(
  partial: Omit<FailureEntry, 'ts' | 'sha'> & { ts?: string; sha?: string },
  opts: { ledgerPath?: string; stubDir?: string } = {},
): RecordResult | null {
  try {
    const entry: FailureEntry = {
      ts: partial.ts ?? new Date().toISOString(),
      sha: partial.sha ?? currentSha(),
      product_class: partial.product_class,
      gate: partial.gate,
      exit_code: partial.exit_code ?? null,
      fix_stage: partial.fix_stage ?? null,
      run_dir: partial.run_dir,
      detail: partial.detail ?? '',
    }
    const ledgerPath = opts.ledgerPath ?? DEFAULT_LEDGER
    appendFailureLedger(entry, ledgerPath)
    const recurrence = recurrenceCount(entry.product_class, entry.gate, ledgerPath)
    const stubPath = draftInvariantStub(entry, recurrence, opts.stubDir ?? DEFAULT_STUB_DIR)
    const escalate = recurrence >= 2
    if (escalate) {
      // a recurring loss is a PATTERN — leave a council-escalation note next to the stub.
      try {
        const note = resolve(opts.stubDir ?? DEFAULT_STUB_DIR, `ESCALATE__${_slug(entry.product_class)}__${_slug(entry.gate)}.md`)
        writeFileSync(note,
          `# ESCALATE: recurring loss\n\n` +
          `**${entry.gate}** has now failed **${recurrence}×** on **${entry.product_class}**.\n` +
          `A repeated loss is a PATTERN, not a one-off — dispatch a coding-council on the fix-stage ` +
          `\`${entry.fix_stage ?? '?'}\` rather than drafting another stub.\n\nLatest: ${entry.run_dir} @ ${entry.sha}\nDetail: ${entry.detail.slice(0, 400)}\n`)
      } catch { /* best-effort */ }
    }
    return { recurrence, escalate, stubPath, ledgerPath }
  } catch {
    return null   // logging must never break the chain
  }
}

// ── selftest (no real ledger touched — injected temp paths) ────────────────────────────
function _selftest(): void {
  const os = require('os'); const path = require('path'); const fs = require('fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lessonloop-'))
  const ledger = path.join(tmp, 'failure-ledger.jsonl')
  const stubs = path.join(tmp, 'stubs')
  const base = { product_class: 'aquaculture_ras', gate: 'drawing:load_reconcile', exit_code: 35,
    fix_stage: 'panel-schedule emitter', run_dir: 'out/x', ts: '2026-06-24T00:00:00Z', sha: 'abc1234' }
  const r1 = recordGateFailure({ ...base, detail: 'panel total 1200kW vs contract 1500kW' }, { ledgerPath: ledger, stubDir: stubs })!
  if (!r1) throw new Error('record returned null')
  if (r1.recurrence !== 1) throw new Error(`expected recurrence 1, got ${r1.recurrence}`)
  if (r1.escalate) throw new Error('first loss must NOT escalate')
  if (!fs.existsSync(r1.stubPath)) throw new Error('stub not drafted')
  if (!fs.readFileSync(r1.stubPath, 'utf8').includes('DRAFT_INVARIANT')) throw new Error('stub missing invariant skeleton')
  // a DIFFERENT gate on the same class must not escalate
  const rOther = recordGateFailure({ ...base, gate: 'drawing:legibility', detail: 'aspect 9:1' }, { ledgerPath: ledger, stubDir: stubs })!
  if (rOther.escalate) throw new Error('different gate must not escalate')
  // the SAME (class, gate) again → recurrence 2 → escalate
  const r2 = recordGateFailure({ ...base, detail: 'panel total 1180kW vs 1500kW (again)' }, { ledgerPath: ledger, stubDir: stubs })!
  if (r2.recurrence !== 2) throw new Error(`expected recurrence 2, got ${r2.recurrence}`)
  if (!r2.escalate) throw new Error('recurring loss MUST escalate at 2x')
  const note = path.join(stubs, 'ESCALATE__aquaculture_ras__drawing_load_reconcile.md')
  if (!fs.existsSync(note)) throw new Error('escalation note not written on recurrence')
  // ledger has 3 lines
  const lines = fs.readFileSync(ledger, 'utf8').split('\n').filter((l: string) => l.trim())
  if (lines.length !== 3) throw new Error(`expected 3 ledger lines, got ${lines.length}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('lesson-loop selftest: OK (append + recurrence + stub draft + escalation-on-2x)')
}

if (require.main === module && process.argv.includes('--selftest')) _selftest()
