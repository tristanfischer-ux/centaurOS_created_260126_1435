/**
 * Verification-only: recompute deriveProcessTopology() from an already-sized state.json's
 * modules (post applyUniversalContractSizing) and write the result back so draw_pid.py can
 * render it. Does NOT run a chain — pure, local, deterministic.
 * Usage: npx tsx scripts/recompute-topology-verify.tsx out/match-verify/state.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deriveProcessTopology, deriveSignalTopology } from './lib/orchestrator/generic/derive-topology'

const path = process.argv[2] || 'out/match-verify/state.json'
const state = JSON.parse(readFileSync(path, 'utf8'))
const modules = state?.moduleDecomposition?.modules ?? []

const fluidEdges = deriveProcessTopology(modules as never[])
const signalEdges = deriveSignalTopology(modules as never[])
const edges = [...fluidEdges, ...signalEdges]

console.log(`[recompute-topology] ${modules.length} modules -> ${fluidEdges.length} fluid/thermal edges + ${signalEdges.length} signal edges = ${edges.length} total`)
console.log('\n== fluid/thermal topology ==')
for (const e of fluidEdges as never as Array<Record<string, unknown>>) {
  console.log(`  ${e.from_part} -> ${e.to_part}  [${e.mechanism}]${e._recirculation_loop ? '  (RECIRC LOOP)' : ''}`)
}

state.orchestratorContract = state.orchestratorContract ?? {}
state.orchestratorContract.topology = edges
writeFileSync(path, JSON.stringify(state))
console.log(`\n[saved] topology recomputed -> ${path}`)
