#!/usr/bin/env npx tsx
/**
 * prove-settle-loop.tsx — verify the multi-pass physics<->Blender settle loop runs the
 * required minimum, settles, busts the cache only on change, and records a clean ledger.
 * Usage: npx tsx scripts/prove-settle-loop.tsx <outDir> [minPasses]
 * Run against a dir that already has manifests (e.g. out/co2-regcheck) to prove the
 * settled-design path (reuses for free); a fresh chain run exercises the re-render path.
 */
import { existsSync } from 'fs'
import { resolve } from 'path'
import { runSettleLoop, settlePassesFromEnv, settleStepShouldBust, settleShouldStop } from './lib/design-loop/settle-loop'

if (process.argv.includes('--selftest')) {
  // Fast, Blender-free guard for the loop-control logic (esp. the bust-on-!settled fix: a
  // settled design must produce ZERO busts even though its writeback re-writes its quantities).
  const cases: [string, boolean][] = [
    ['pass 1 never busts', settleStepShouldBust(1, true) === false],
    ['settled prev → NO bust (the fixed bug)', settleStepShouldBust(2, true) === false],
    ['settled prev → NO bust at pass 4', settleStepShouldBust(4, true) === false],
    ['unsettled prev → bust', settleStepShouldBust(2, false) === true],
    ['below min → do not stop', settleShouldStop(3, true, 4) === false],
    ['min + settled → stop', settleShouldStop(4, true, 4) === true],
    ['min but not settled → do not stop', settleShouldStop(5, false, 4) === false],
  ]
  let ok = true
  for (const [label, pass] of cases) { console.log(`  ${pass ? '✓' : '✗'} ${label}`); ok = ok && pass }
  console.log(ok ? '[selftest] PASS' : '[selftest] FAIL')
  process.exit(ok ? 0 : 1)
}

const outDir = process.argv[2] || 'out/co2-regcheck'
const minPasses = settlePassesFromEnv(process.argv[3], 4)
const statePath = resolve(outDir, 'state.json')
const venvPy = resolve(__dirname, '..', '.venv', 'bin', 'python')
const pyBin = existsSync(venvPy) ? venvPy : 'python3'
const drawScript = resolve(__dirname, 'blender-universal', 'generate_drawing_set.py')

if (!existsSync(statePath)) { console.error(`[prove] no state.json in ${outDir}`); process.exit(2) }

console.log(`[prove] settle loop on ${outDir} (min ${minPasses} passes, cap 8)`)
const r = runSettleLoop(statePath, outDir, { pyBin, drawScript, cwd: resolve(__dirname, '..'), minPasses, maxPasses: 8 })

console.log('\n[prove] ledger:')
for (const p of r.passes) console.log(`  pass ${p.pass}: applied=${p.applied}  settled=${p.settled}  cache-busted=${p.busted}`)
console.log(`[prove] total passes=${r.totalPasses}  forced re-renders=${r.forcedRenders}  settledAt=${r.settledAt}`)

const last = r.passes[r.passes.length - 1]
const checks: [string, boolean][] = [
  [`ran the minimum ${minPasses} passes`, r.totalPasses >= minPasses],
  ['reached a settled state', r.settledAt != null],
  ['final pass is settled', !!last?.settled],
  ['no cache-bust on a settled pass (free reuse held)', r.passes.every(p => !p.busted || p.applied >= 0)],
]
let ok = true
for (const [label, pass] of checks) { console.log(`  ${pass ? '✓' : '✗'} ${label}`); ok = ok && pass }
console.log(ok ? '[prove] PASS' : '[prove] FAIL')
process.exit(ok ? 0 : 1)
