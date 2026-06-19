#!/usr/bin/env npx tsx
// Off-budget verifier for gate-34 (tool-archetype coherence). Loads a state.json,
// shows the verdict BEFORE and AFTER simulating the chain's INC-1 drop-filter
// (drop a tool that self-declares applicable_to_class===false AND trips a wrong-domain
// marker). No chain run. Usage: npx tsx scripts/verify-tool-archetype.tsx <state.json>
import { readFileSync } from 'fs'
import {
  computeToolArchetypeCoherence,
  toolLeaksWrongDomain,
  inferProductClass,
} from '../src/lib/pdf-engine-v2/lib/tool-archetype-coherence-audit'

const path = process.argv[2]
if (!path) { console.error('usage: verify-tool-archetype.tsx <state.json>'); process.exit(1) }
const state = JSON.parse(readFileSync(path, 'utf-8'))

const before = computeToolArchetypeCoherence(state)
console.log(`class=${before.product_class}`)
console.log(`BEFORE filter: verdict=${before.verdict}  findings=${before.findings.length}`)
for (const f of before.findings) console.log(`   • ${f.tool_id} [${f.family}:${f.marker}]`)

// Simulate the chain's INC-1 page drop-filter.
const pc = inferProductClass(state)
const tools = state?.toolsUsedPage?.tools
if (Array.isArray(tools)) {
  const kept = tools.filter((t: any) => !(t?.applicable_to_class === false && toolLeaksWrongDomain(t, pc)))
  const dropped = tools.filter((t: any) => !kept.includes(t)).map((t: any) => t?.tool_id)
  state.toolsUsedPage.tools = kept
  if (dropped.length) console.log(`(filter dropped: ${dropped.join(', ')})`)
}

const after = computeToolArchetypeCoherence(state)
console.log(`AFTER filter:  verdict=${after.verdict}  findings=${after.findings.length}`)
for (const f of after.findings) console.log(`   • residual: ${f.tool_id} [${f.family}:${f.marker}]`)
console.log(`→ tool_archetype score:  BEFORE ${before.verdict === 'pass' ? 10 : 2}/10   AFTER ${after.verdict === 'pass' ? 10 : 2}/10`)
