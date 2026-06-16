/**
 * Exercise applyUniversalContractSizing (incl. the #140 instrumentation pass) against a
 * real chain state, IN ISOLATION (no LLM stages). Strips the prior baked explosion +
 * instruments so the deterministic pass re-derives the BoM cleanly, then writes it back.
 * Usage: npx tsx scripts/test-instrumentation.tsx out/ras-converged/state.json [outDir]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { applyUniversalContractSizing } from './lib/orchestrator/generic/universal-contract-sizing'

const path = process.argv[2] || 'out/ras-converged/state.json'
const state = JSON.parse(readFileSync(path, 'utf8'))
const modules = state?.moduleDecomposition?.modules ?? []
const contract = state?.orchestratorContract ?? { quantities: {} }

// clean slate: drop the prior explosion children (id contains '__') + prior instruments
let strippedChildren = 0
let strippedInstr = 0
for (const m of modules) {
  for (const sm of m.sub_modules ?? []) {
    if (!Array.isArray(sm.words)) continue
    const before = sm.words.length
    sm.words = sm.words.filter((w: any) => {
      if (w._instrument || w._actuator || w._utility || w._process) { strippedInstr++; return false }
      if (String(w.id ?? '').includes('__')) { strippedChildren++; return false }
      return true
    })
    void before
  }
}

// faithful isolation: do NOT re-synthesise principals (they already exist — re-minting
// would spuriously split flow-sub-quantities into extra devices). Add instruments + a
// clean re-explosion (regenerates sub-components against the new SUB_ASSEMBLY list).
const res = applyUniversalContractSizing(modules, contract, {
  onlyUnsized: true, synthesizeMissing: false, dedupeAndStrip: false, instrument: true, explode: true,
})

console.log(`\n== stripped: ${strippedChildren} prior children, ${strippedInstr} prior instruments`)
console.log(`== groups ${res.groups} | sized ${res.sized} | synthesised ${res.synthesized} | dropped ${res.dropped} | INSTRUMENTED ${res.instrumented} | exploded ${res.exploded}`)

// show the synthesised instruments
console.log(`\n== INSTRUMENTS synthesised (process control variables → field instruments):`)
for (const m of modules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  if (!(w as any)._instrument) continue
  const mods = w.modifier_characters ?? []
  const qty = mods.find((x: any) => x.kind === 'quantity')?.value ?? ''
  const rng = mods.find((x: any) => x.kind === 'rating_primary')?.value ?? ''
  const gbp = mods.find((x: any) => x.kind === 'price_estimate_gbp')?.value ?? ''
  const host = (w as any)._instrument_of ?? ''
  console.log(`  ${qty.padEnd(5)} ${(w.name_human ?? '?').padEnd(34)} ${String(rng).padEnd(26)} £${gbp}  on ${host}`)
}

const outDir = process.argv[3]
if (outDir) {
  writeFileSync(`${outDir}/state.json`, JSON.stringify(state))
  // refresh the cached requirementsBom the SAME way the chain does (serial-design-chain-v2
  // ~line 7025): re-run the assembler over the settled state so the dashboard + PDF BoM
  // page reflect the new instruments instead of a stale cached BoM.
  try {
    const reqVenv = resolve(__dirname, '..', '.venv', 'bin', 'python')
    const reqBin = existsSync(reqVenv) ? reqVenv : 'python3'
    const reqOut = execFileSync(reqBin, [resolve(__dirname, 'requirements_bom.py'), outDir, '--json'], { encoding: 'utf8', cwd: resolve(__dirname, '..'), maxBuffer: 16 * 1024 * 1024 })
    const reqRows = JSON.parse(reqOut)
    if (Array.isArray(reqRows) && reqRows.length > 0) {
      state.requirementsBom = reqRows
      writeFileSync(`${outDir}/state.json`, JSON.stringify(state))
      const instr = reqRows.filter((r: any) => r.status === 'INSTRUMENT')
      console.log(`[saved] re-derived state + refreshed requirementsBom (${reqRows.length} rows, ${instr.length} INSTRUMENT) → ${outDir}/state.json`)
    }
  } catch (e) {
    console.log(`[warn] requirementsBom refresh failed: ${String(e).slice(0, 200)}`)
  }
}
