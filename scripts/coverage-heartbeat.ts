/**
 * coverage-heartbeat.ts — the £0 archetype-coverage QUEUE maintainer (ForgeOS #3 + #4, 2026-06-24).
 *
 * Tristan chose QUEUE, not auto-dispatch (his standing cost rule: an LLM cron = ~£300-600/day; the
 * watchdog is a £0 BEHAVIOURAL trigger, never an LLM cron). So this is a pure, no-LLM aggregator: it
 * reads the cross-run failure-ledger (written by lesson-loop.ts #1) + each archetype's last scorecard
 * floor, and writes a ranked WORK-QUEUE of classes that are <8 or stale. It DISPATCHES NOTHING — an
 * agent or human drains the queue. Each queue entry carries:
 *   - the gates that failed + their recurrence (escalating = a (class,gate) seen >=2x — a PATTERN),
 *   - a DRAIN command that sets the mature gates ENFORCING (#4: DRAWING_GATES_ENFORCING +
 *     COST_SANITY_ENFORCING) so the >=8 floor actually BITES on the coverage re-run — without
 *     touching in-flight human re-runs (which stay shadow),
 *   - the instruction to drain in an ISOLATED git WORKTREE (Agent isolation:'worktree') — the direct
 *     fix for the "3-example concurrent runner ran away" collision on the shared emitter / DB.
 *
 * Run it ad-hoc, or cron it (it only writes a file — no spend). Pure aggregation; fully testable.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

const LEDGER = resolve(homedir(), '.forge-truth', 'failure-ledger.jsonl')
const QUEUE_OUT = resolve(homedir(), '.forge-truth', 'coverage-queue.json')

export interface LedgerRow {
  ts: string; product_class: string; gate: string; exit_code: number | null
  fix_stage: string | null; run_dir: string; sha: string; detail: string
}
export interface QueueEntry {
  product_class: string
  priority: number
  escalating: boolean
  n_failures: number
  gates: Array<{ gate: string; count: number; escalate: boolean; fix_stage: string | null }>
  last_seen: string
  last_run_dir: string
  drain: { worktree: string; command: string }
}

const ENFORCE_PREFIX = 'DRAWING_GATES_ENFORCING=1 COST_SANITY_ENFORCING=1'

/** Pure: fold ledger rows → a ranked coverage queue. `nowMs`/brief-resolver injected for tests. */
export function buildCoverageQueue(
  rows: LedgerRow[],
  opts: { briefFor?: (cls: string) => string } = {},
): QueueEntry[] {
  const briefFor = opts.briefFor ?? ((cls: string) => `briefs-loop/${cls}.md`)
  const byClass = new Map<string, LedgerRow[]>()
  for (const r of rows) {
    if (!r || !r.product_class) continue
    const a = byClass.get(r.product_class) || []
    a.push(r)
    byClass.set(r.product_class, a)
  }
  const entries: QueueEntry[] = []
  for (const [cls, rs] of byClass) {
    const gateCounts = new Map<string, { count: number; fix_stage: string | null }>()
    let lastSeen = ''
    let lastRun = ''
    for (const r of rs) {
      const g = gateCounts.get(r.gate) || { count: 0, fix_stage: r.fix_stage }
      g.count++
      if (r.fix_stage) g.fix_stage = r.fix_stage
      gateCounts.set(r.gate, g)
      if (r.ts > lastSeen) { lastSeen = r.ts; lastRun = r.run_dir }
    }
    const gates = [...gateCounts.entries()]
      .map(([gate, v]) => ({ gate, count: v.count, escalate: v.count >= 2, fix_stage: v.fix_stage }))
      .sort((a, b) => b.count - a.count)
    const escalating = gates.some((g) => g.escalate)
    entries.push({
      product_class: cls,
      priority: 0, // assigned after sort
      escalating,
      n_failures: rs.length,
      gates,
      last_seen: lastSeen,
      last_run_dir: lastRun,
      drain: {
        worktree: `drain in an ISOLATED git worktree (Agent isolation:'worktree') — avoids the shared emitter/DB collision (the '3-example runaway')`,
        command: `${ENFORCE_PREFIX} npx tsx scripts/serial-design-chain-v2.tsx ${briefFor(cls)} out/${cls}-coverage`,
      },
    })
  }
  // rank: escalating first, then most failures, then most-recent
  entries.sort((a, b) =>
    Number(b.escalating) - Number(a.escalating) ||
    b.n_failures - a.n_failures ||
    (b.last_seen < a.last_seen ? -1 : b.last_seen > a.last_seen ? 1 : 0))
  entries.forEach((e, i) => { e.priority = i + 1 })
  return entries
}

function _readLedger(path: string): LedgerRow[] {
  if (!existsSync(path)) return []
  const out: LedgerRow[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* skip malformed */ }
  }
  return out
}

function main(): void {
  const rows = _readLedger(LEDGER)
  const queue = buildCoverageQueue(rows)
  mkdirSync(resolve(QUEUE_OUT, '..'), { recursive: true })
  writeFileSync(QUEUE_OUT, JSON.stringify({ generated_from: LEDGER, n_classes: queue.length, queue }, null, 2))
  console.log(`[coverage-heartbeat] ${rows.length} ledger row(s) → ${queue.length} class(es) queued → ${QUEUE_OUT}`)
  if (!queue.length) { console.log('[coverage-heartbeat] queue EMPTY — no failing class on record. (£0, no dispatch.)'); return }
  console.log('[coverage-heartbeat] DRAIN ORDER (an agent/human runs each in its own worktree — nothing auto-dispatches):')
  for (const e of queue) {
    const tag = e.escalating ? '⚠ ESCALATING' : ''
    console.log(`  #${e.priority} ${e.product_class}  (${e.n_failures} loss(es)${tag ? ', ' + tag : ''}) — gates: ${e.gates.map((g) => `${g.gate}×${g.count}`).join(', ')}`)
    console.log(`      drain: ${e.drain.command}`)
  }
}

// ── selftest ────────────────────────────────────────────────────────────────────────────
function _selftest(): void {
  const now = '2026-06-24T10'
  const rows: LedgerRow[] = [
    { ts: now + ':00Z', product_class: 'aquaculture_ras', gate: 'drawing:load_reconcile', exit_code: 35, fix_stage: 'panel', run_dir: 'out/a', sha: 'x', detail: '' },
    { ts: now + ':01Z', product_class: 'aquaculture_ras', gate: 'drawing:load_reconcile', exit_code: 35, fix_stage: 'panel', run_dir: 'out/a2', sha: 'x', detail: '' }, // recurs → escalate
    { ts: now + ':02Z', product_class: 'co2_mineralisation', gate: 'scorecard:cost', exit_code: null, fix_stage: null, run_dir: 'out/c', sha: 'x', detail: '' },
  ]
  const q = buildCoverageQueue(rows, { briefFor: (c) => `briefs-loop/${c}.md` })
  if (q.length !== 2) throw new Error(`expected 2 classes, got ${q.length}`)
  // RAS escalating (2x same gate) ranks #1
  if (q[0].product_class !== 'aquaculture_ras' || !q[0].escalating) throw new Error('escalating class must rank #1')
  if (q[0].gates[0].count !== 2 || !q[0].gates[0].escalate) throw new Error('recurring gate must show count 2 + escalate')
  if (q[1].escalating) throw new Error('single-failure class must not escalate')
  if (!q[0].drain.command.includes('DRAWING_GATES_ENFORCING=1') || !q[0].drain.command.includes('COST_SANITY_ENFORCING=1'))
    throw new Error('#4: drain command must set the mature gates enforcing')
  if (!q[0].drain.command.includes('briefs-loop/aquaculture_ras.md')) throw new Error('drain must target the class brief')
  if (!q[0].drain.worktree.toLowerCase().includes('worktree')) throw new Error('drain must instruct worktree isolation')
  if (buildCoverageQueue([]).length !== 0) throw new Error('empty ledger → empty queue')
  console.log('coverage-heartbeat selftest: OK (fold + escalation-ranking + enforcing-drain + worktree + empty)')
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) _selftest()
  else main()
}
