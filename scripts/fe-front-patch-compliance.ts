/**
 * INTENT: Recompute complianceGate for formula_e_front_mgu after class-standards
 * registry was added — stale WARN on state floored Risk at 7.
 */
import { readFileSync, writeFileSync } from 'fs'
import { runComplianceGate } from '../src/lib/pdf-engine-v2/stages/3.5-compliance-gate'

const out = process.argv[2] || 'out/formula-e-front-mgu-20260729-1432'
const state = JSON.parse(readFileSync(`${out}/state.json`, 'utf8'))
const productClass =
  state?.moduleDecomposition?.product_class
  || state?.orchestratorContract?.product_class
  || 'formula_e_front_mgu'
const parsedBrief = state?.parsedBrief || {}
const briefText = readFileSync('briefs-loop/formula_e_front_mgu.md', 'utf8')
const res = runComplianceGate(parsedBrief, productClass, briefText)
console.log(JSON.stringify({
  verdict: res.verdict,
  mandatory_total: res.mandatory_total,
  mandatory_covered: res.mandatory_covered,
  reason: res.reason,
  conflicts: (res.conflicts || []).slice(0, 4),
}, null, 2))
state.complianceGate = res
writeFileSync(`${out}/state.json`, JSON.stringify(state, null, 2))
console.log(`wrote ${out}/state.json complianceGate`)
