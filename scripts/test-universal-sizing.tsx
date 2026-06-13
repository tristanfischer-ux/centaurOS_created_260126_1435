/**
 * Quick verification of applyUniversalContractSizing against a real chain state.
 * Usage: npx tsx scripts/test-universal-sizing.tsx out/ras-r1-20260613/state.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { applyUniversalContractSizing } from './lib/orchestrator/generic/universal-contract-sizing'

const path = process.argv[2] || 'out/ras-r1-20260613/state.json'
const state = JSON.parse(readFileSync(path, 'utf8'))
const modules = state?.moduleDecomposition?.modules ?? []
const contract = state?.orchestratorContract ?? { quantities: {} }

const before = modules.flatMap((m: any) => (m.sub_modules ?? []).flatMap((sm: any) => (sm.words ?? []).map((w: any) => w.name_human)))
const res = applyUniversalContractSizing(modules, contract, { onlyUnsized: true, synthesizeMissing: true, dedupeAndStrip: true })

console.log(`\n== groups built from contract: ${res.groups}`)
console.log(`== words sized in place: ${res.sized}  | synthesised: ${res.synthesized} (${res.synthesizedPhrases.join(', ')})  | DROPPED: ${res.dropped}`)

const after = modules.flatMap((m: any) => (m.sub_modules ?? []).flatMap((sm: any) => (sm.words ?? []).map((w: any) => w.name_human)))
const gone = before.filter((n: string) => !after.includes(n))
console.log(`\n== words DROPPED (${gone.length}): ${gone.join(', ')}`)
console.log(`\n== SURVIVING BoM (${after.length} lines):`)
console.log('flag name'.padEnd(48), 'dimension'.padEnd(26), 'qty / rating')
for (const m of modules) for (const sm of m.sub_modules ?? []) for (const w of sm.words ?? []) {
  const mods = w.modifier_characters ?? []
  const dim = mods.find((x: any) => x.kind === 'dimension')?.value ?? ''
  const qty = mods.find((x: any) => x.kind === 'quantity')?.value ?? ''
  const ratA = mods.find((x: any) => x.kind === 'rating_primary')
  const cap = mods.find((x: any) => x.kind === 'capacity')
  const rat = ratA ? `${ratA.value}${ratA.unit ? ' ' + ratA.unit : ''}` : (cap ? `${cap.value} ${cap.unit ?? ''}` : '')
  const flag = (w as any)._synthesized ? 'NEW' : (dim ? 'siz' : '   ')
  console.log(flag, (w.name_human ?? '?').slice(0, 42).padEnd(44), (dim || '—').padEnd(26), `${qty}${rat ? '  | ' + rat : ''}`)
}

// optionally write the sized state for a standalone Blender check
const outDir = process.argv[3]
if (outDir) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(`${outDir}/state.json`, JSON.stringify(state))
  console.log(`\n[saved] sized state → ${outDir}/state.json`)
}
