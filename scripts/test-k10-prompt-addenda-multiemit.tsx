#!/usr/bin/env npx tsx
/**
 * @file scripts/test-k10-prompt-addenda-multiemit.tsx
 *
 * @description Multi-emitter UNION re-test for the K10 prompt addenda
 *   (K10-1..K10-7 from prior dispatch + K10-5 enumeration + K10-8 module-
 *   presence enforcement from this dispatch).
 *
 *   For each of 4 datapoints (BESS×2, heat-pump, EV-charger):
 *     1. Read the brief text + product_class hint.
 *     2. Dispatch the 6 production emitter models in parallel.
 *     3. Parse each to MultiEmitterDecompositionPayload.
 *     4. Call synthesiseMultiEmitterDecomposition with empty judges
 *        (synthesis-only pass — matches production first-pass behaviour
 *        before judge verdicts come back).
 *     5. Build the synthesised ModuleDecomposition shape.
 *     6. Run K10 shadow validation, print missing_required summary.
 *
 *   This mirrors the production runMultiEmitterModuleDecomposition path
 *   WITHOUT the judge round-trip + retry, which is fine because the K10
 *   shadow only cares about the synthesised modules + cross_module_grammar_links.
 *
 * @usage  npx tsx scripts/test-k10-prompt-addenda-multiemit.tsx [bess1|bess2|heatpump|ev|all]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

// ─── env loading ────────────────────────────────────────────────────────────
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
]) {
  try {
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch { /* missing env file ok */ }
}

import { MODULE_DECOMPOSITION_TAXONOMY_PROMPT } from '../src/lib/pdf-engine-v2/prompts'
import { runK10ShadowValidation } from '../src/lib/pdf-engine-v2/stages/1.7-module-decomposition'
import { ensureGraphsRegistered } from '../src/lib/pdf-engine-v2/class-reference-graph'
import {
  synthesiseMultiEmitterDecomposition,
  type MultiEmitterOutput,
} from '../src/lib/pdf-engine-v2/radical/council-synthesis'
import type {
  ModuleDecomposition,
  UniversalModule,
  CrossModuleGrammarLink,
  ModuleSpec,
} from '../src/lib/pdf-engine-v2/types/module-decomposition'

type Datapoint = {
  name: string
  briefPath: string
  productClass: string
  baselineMissing: number      // yesterday's shadow report baseline
  singleEmitterMissing: number // prior addenda single-emitter Grok 4.3 result
}

const DATAPOINTS: Datapoint[] = [
  { name: 'bess1',    briefPath: '/tmp/k10-rerun-brief-bess1.txt',    productClass: 'energy_storage',      baselineMissing: 5, singleEmitterMissing: 10 },
  { name: 'bess2',    briefPath: '/tmp/k10-rerun-brief-bess2.txt',    productClass: 'energy_storage',      baselineMissing: 8, singleEmitterMissing: 10 },
  { name: 'heatpump', briefPath: '/tmp/k10-rerun-brief-heatpump.txt', productClass: 'heat_pump',           baselineMissing: 3, singleEmitterMissing:  5 },
  { name: 'ev',       briefPath: '/tmp/k10-rerun-brief-ev.txt',       productClass: 'dc_fast_ev_charger',  baselineMissing: 4, singleEmitterMissing:  7 },
]

// Same 6 emitters as production runMultiEmitterModuleDecomposition.
const EMITTERS: ReadonlyArray<string> = [
  'google/gemini-3.1-pro-preview',
  'x-ai/grok-4.3',
  'anthropic/claude-opus-4-7',
  'qwen/qwen3.6-max-preview',
  'xiaomi/mimo-v2.5-pro',
  'moonshotai/kimi-k2.6',
] as const

const OUT_DIR = resolve(process.cwd(), '/tmp/k10-multiemit-out')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

// ─── helpers ────────────────────────────────────────────────────────────────

function parseJsonLoose(raw: string): any {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  try { return JSON.parse(s) } catch {}
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 200)} ... Tail: ${s.slice(-200)}`)
}

async function callOneEmitter(
  model: string,
  brief: string,
  productClassHint: string,
): Promise<{ ok: boolean; raw: string; parsed: any | null; error?: string; tokens: { input: number; output: number } }> {
  const userMsg = `Decompose the hardware product described in this brief into the 12 universal engineering modules per the system schema in the system message. Emit the FULL JSON object — every module needs derived_parameters, sub_modules, grammar_links, overview_paragraph_en. Every sub_module needs words[], english_sentence, rad_syntax. CRITICAL: cross_module_grammar_links must follow the K10 REQUIRED CROSS-MODULE EDGES section of the system prompt — do not skip mechanical_mount-to-structure_containment, do not skip hard-wired safety chains, do not collapse two-edge thermal chains, do not skip the DC distribution panel for BESS, do not collapse Modbus-TCP into one bus link (enumerate by subsystem per K10-5), emit BOTH power+comms edges for EV charging cables, and use detail field for PWM/modulation qualifiers on variable-speed actuators. K10-8: do NOT add sensing_instrumentation, actuation_kinematics, or mass_fluid_transport_process to excluded_modules when the K10 reference-graph requires edges to/from those modules.

PRODUCT CLASS HINT (use as product_class top-level field unless the brief clearly contradicts): ${productClassHint}

PRODUCT BRIEF:
${brief}

Return ONLY the JSON object, no preamble, no markdown fences.`

  // OUTER timeout that covers headers + body read. AbortSignal handles fetch
  // but Node's response.json() body-read is NOT covered by the same signal
  // once headers have been received — wrap the entire op in a Promise.race
  // with a hard deadline so a slow body stream can't hang the whole pipeline.
  const HARD_DEADLINE_MS = 480_000  // 8 min per emitter — leaves headroom for retries within 2h cap
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HARD_DEADLINE_MS)

  const fetchAndRead = async (): Promise<{ ok: boolean; raw: string; parsed: any | null; error?: string; tokens: { input: number; output: number } }> => {
    let response: Response
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: MODULE_DECOMPOSITION_TAXONOMY_PROMPT },
            { role: 'user', content: userMsg },
          ],
          temperature: 0,
          max_tokens: 150_000,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      return { ok: false, raw: '', parsed: null, error: `transport: ${(err as Error).message}`, tokens: { input: 0, output: 0 } }
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)')
      return { ok: false, raw: '', parsed: null, error: `HTTP ${response.status}: ${errText.slice(0, 300)}`, tokens: { input: 0, output: 0 } }
    }
    let json: any
    try {
      json = await response.json()
    } catch (err) {
      return { ok: false, raw: '', parsed: null, error: `body-read: ${(err as Error).message}`, tokens: { input: 0, output: 0 } }
    }
    const raw = (json.choices?.[0]?.message?.content ?? '').trim()
    const tokens = { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 }
    try {
      const parsed = parseJsonLoose(raw)
      return { ok: true, raw, parsed, tokens }
    } catch (err) {
      return { ok: false, raw, parsed: null, error: `parse: ${(err as Error).message}`, tokens }
    }
  }

  // Promise.race the actual work against a hard wall-clock — even if fetch's
  // AbortSignal misses (e.g. stalled body read), we'll return.
  const hardTimeout = new Promise<{ ok: boolean; raw: string; parsed: any | null; error?: string; tokens: { input: number; output: number } }>(resolve => {
    setTimeout(() => resolve({ ok: false, raw: '', parsed: null, error: `hard-timeout after ${HARD_DEADLINE_MS}ms`, tokens: { input: 0, output: 0 } }), HARD_DEADLINE_MS + 5_000)
  })
  try {
    return await Promise.race([fetchAndRead(), hardTimeout])
  } finally {
    clearTimeout(timeout)
  }
}

// Reduce any parsed emitter JSON to the minimal MultiEmitterDecompositionPayload
// the synthesiser expects.
function reduceToPayload(parsed: any): {
  product_class: string
  modules: ModuleSpec[]
  excluded_modules: UniversalModule[]
  rationale_excluded: Partial<Record<UniversalModule, string>>
  cross_module_grammar_links: CrossModuleGrammarLink[]
} | null {
  if (!parsed || typeof parsed !== 'object') return null
  const product_class = typeof parsed.product_class === 'string' ? parsed.product_class : ''
  const modulesRaw = Array.isArray(parsed.modules) ? parsed.modules : []
  const modules: ModuleSpec[] = modulesRaw
    .filter((m: any) => m && typeof m === 'object' && typeof m.module === 'string')
    .map((m: any) => m as ModuleSpec)
  const excluded_modules: UniversalModule[] = Array.isArray(parsed.excluded_modules)
    ? (parsed.excluded_modules as unknown[]).filter((s: unknown) => typeof s === 'string') as UniversalModule[]
    : []
  const rationale_excluded = (parsed.rationale_excluded && typeof parsed.rationale_excluded === 'object')
    ? parsed.rationale_excluded
    : {}
  const cross_module_grammar_links: CrossModuleGrammarLink[] = Array.isArray(parsed.cross_module_grammar_links)
    ? (parsed.cross_module_grammar_links as any[]).filter(
        cl => cl && typeof cl.from_module === 'string' && typeof cl.to_module === 'string' && typeof cl.mechanism === 'string',
      )
    : []
  return { product_class, modules, excluded_modules, rationale_excluded, cross_module_grammar_links }
}

async function runOne(dp: Datapoint): Promise<{
  verdict: string
  missing: number
  extras: number
  matched: number
  protoMis: number
  missingEdges: any[]
  emitterStatus: Array<{ model: string; ok: boolean; error?: string; tokens: { input: number; output: number } }>
  excluded: UniversalModule[]
}> {
  console.log(`\n═══════ ${dp.name} (${dp.productClass}) ═══════`)
  console.log(`  baseline (UNION yesterday): ${dp.baselineMissing}   single-emitter (Grok 4.3): ${dp.singleEmitterMissing}`)
  const brief = readFileSync(dp.briefPath, 'utf-8')
  console.log(`  brief: ${brief.length} chars`)
  console.log(`  dispatching ${EMITTERS.length} emitters in parallel...`)

  const t0 = Date.now()
  const settled = await Promise.allSettled(EMITTERS.map(async m => {
    const ts = Date.now()
    const r = await callOneEmitter(m, brief, dp.productClass)
    console.log(`    [emit-done] ${m.padEnd(34)} ${Date.now() - ts}ms  ok=${r.ok}${r.error ? ' err=' + r.error.slice(0, 80) : ''}`)
    return r
  }))
  const wall = Date.now() - t0
  console.log(`  emitter wall: ${wall}ms`)

  // Save raw outputs + build MultiEmitterOutput[]
  const emitterOutputs: MultiEmitterOutput[] = []
  const emitterStatus: Array<{ model: string; ok: boolean; error?: string; tokens: { input: number; output: number } }> = []
  for (let i = 0; i < settled.length; i++) {
    const model = EMITTERS[i]
    const slug = model.replace(/[\/.]/g, '_')
    const r = settled[i]
    if (r.status === 'rejected') {
      console.log(`    ${model.padEnd(34)} REJECTED: ${String(r.reason).slice(0, 100)}`)
      emitterOutputs.push({ ok: false, model, schemaViolations: [`promise: ${String(r.reason)}`] })
      emitterStatus.push({ model, ok: false, error: String(r.reason).slice(0, 200), tokens: { input: 0, output: 0 } })
      continue
    }
    const v = r.value
    writeFileSync(resolve(OUT_DIR, `${dp.name}.${slug}.raw.txt`), v.raw || '(empty)')
    if (!v.ok || !v.parsed) {
      console.log(`    ${model.padEnd(34)} FAILED: ${v.error}`)
      emitterOutputs.push({ ok: false, model, schemaViolations: [v.error ?? 'unknown'] })
      emitterStatus.push({ model, ok: false, error: v.error, tokens: v.tokens })
      continue
    }
    writeFileSync(resolve(OUT_DIR, `${dp.name}.${slug}.parsed.json`), JSON.stringify(v.parsed, null, 2))
    const payload = reduceToPayload(v.parsed)
    if (!payload || payload.modules.length === 0) {
      console.log(`    ${model.padEnd(34)} no usable modules`)
      emitterOutputs.push({ ok: false, model, schemaViolations: ['no usable modules'] })
      emitterStatus.push({ model, ok: false, error: 'no usable modules', tokens: v.tokens })
      continue
    }
    console.log(`    ${model.padEnd(34)} OK   modules=${payload.modules.length}  cross=${payload.cross_module_grammar_links.length}  excluded=[${payload.excluded_modules.join(',')}]   tok(${v.tokens.input}/${v.tokens.output})`)
    emitterOutputs.push({ ok: true, model, data: payload })
    emitterStatus.push({ model, ok: true, tokens: v.tokens })
  }

  // Synthesise (empty judges — first-pass synthesis).
  const synth = synthesiseMultiEmitterDecomposition(emitterOutputs, [], dp.productClass)
  console.log(`  SYNTH: modules=${synth.synthesised.modules.length}  cross=${synth.synthesised.cross_module_grammar_links.length}  excluded=[${synth.synthesised.excluded_modules.join(',')}]  verdict=${synth.verdict}`)
  for (const n of synth.notes) console.log(`    [synth-note] ${n}`)

  // Save synthesised
  writeFileSync(resolve(OUT_DIR, `${dp.name}.synthesised.json`), JSON.stringify(synth.synthesised, null, 2))

  // Wrap into ModuleDecomposition for K10 shadow.
  const md: ModuleDecomposition = {
    product_class: synth.synthesised.product_class,
    modules: synth.synthesised.modules,
    excluded_modules: synth.synthesised.excluded_modules,
    rationale_excluded: synth.synthesised.rationale_excluded,
    cross_module_grammar_links: synth.synthesised.cross_module_grammar_links,
  } as ModuleDecomposition

  const k10 = await runK10ShadowValidation(md)
  console.log(`  K10 verdict=${k10.verdict}  class=${k10.class || '(none)'}  matched=${k10.matched_edges}  missing=${k10.missing_required.length}  extras=${k10.extra_emitted.length}  proto_mis=${k10.protocol_mismatches.length}`)
  if (k10.reason) console.log(`  reason: ${k10.reason}`)
  if (k10.missing_required.length > 0) {
    console.log(`  --- missing required (${k10.missing_required.length}) ---`)
    for (const m of k10.missing_required) {
      console.log(`    ✗ ${m.from_class} ↔ [${(m as any).protocol ?? m.mechanism ?? '?'}] ${m.to_class}`)
    }
  }

  const delta = k10.missing_required.length - dp.baselineMissing
  console.log(`  Δ vs baseline: ${delta >= 0 ? '+' : ''}${delta}`)
  return {
    verdict: k10.verdict,
    missing: k10.missing_required.length,
    extras: k10.extra_emitted.length,
    matched: k10.matched_edges,
    protoMis: k10.protocol_mismatches.length,
    missingEdges: k10.missing_required.map(m => ({
      from: m.from_class, to: m.to_class, mech: m.mechanism, proto: (m as any).protocol,
    })),
    emitterStatus,
    excluded: synth.synthesised.excluded_modules,
  }
}

async function main() {
  const which = (process.argv[2] ?? 'all').toLowerCase()
  const targets = which === 'all' ? DATAPOINTS : DATAPOINTS.filter(d => d.name === which)
  if (targets.length === 0) {
    console.error(`Unknown datapoint: ${which}. Use one of: ${DATAPOINTS.map(d => d.name).join('|')} | all`)
    process.exit(1)
  }
  // Pre-register K10 graphs so synthesis-side K10-8 override can consult them
  // (the override is a no-op if graphs aren't registered, then K10 shadow
  // validation re-discovers the missing edges downstream).
  await ensureGraphsRegistered()
  const results: Array<{ name: string; baseline: number; singleEmitter: number; result: Awaited<ReturnType<typeof runOne>> }> = []
  for (const dp of targets) {
    try {
      const r = await runOne(dp)
      results.push({ name: dp.name, baseline: dp.baselineMissing, singleEmitter: dp.singleEmitterMissing, result: r })
    } catch (err) {
      console.error(`\n[k10-multiemit] ${dp.name} FAILED: ${(err as Error).message}`)
      results.push({
        name: dp.name, baseline: dp.baselineMissing, singleEmitter: dp.singleEmitterMissing,
        result: { verdict: 'ERROR', missing: -1, extras: -1, matched: -1, protoMis: -1, missingEdges: [], emitterStatus: [], excluded: [] },
      })
    }
  }

  console.log('\n\n═══════ FINAL ROLL-UP (multi-emitter UNION) ═══════')
  console.log('  datapoint    baseline -> new   Δ_base    Δ_single   matched  verdict        pass_le_1')
  let passed = 0
  for (const r of results) {
    const deltaBase = r.result.missing - r.baseline
    const deltaSingle = r.result.missing - r.singleEmitter
    const pass = r.result.missing >= 0 && r.result.missing <= 1
    if (pass) passed++
    console.log(
      `  ${r.name.padEnd(10)}   ${String(r.baseline).padStart(3)} -> ${String(r.result.missing).padStart(3)}     ${((deltaBase >= 0 ? '+' : '') + deltaBase).padStart(4)}      ${((deltaSingle >= 0 ? '+' : '') + deltaSingle).padStart(4)}     ${String(r.result.matched).padStart(4)}   ${r.result.verdict.padEnd(13)}  ${pass ? 'PASS' : 'FAIL'}`,
    )
  }
  console.log(`\n  Pass criteria: missing_required ≤ 1 on ≥ 3 of 4 datapoints`)
  console.log(`  Actual: ${passed} of ${results.length} pass`)
  console.log(`  ${passed >= 3 ? '✓ OVERALL PASS — proceed to enforcing mode dispatch' : '✗ OVERALL FAIL — iterate'}`)
  writeFileSync(resolve(OUT_DIR, 'rollup.json'), JSON.stringify({ emitters: EMITTERS, results }, null, 2))
  console.log(`\n  rollup → ${resolve(OUT_DIR, 'rollup.json')}`)
  console.log(`  outputs → ${OUT_DIR}/*.{raw,parsed,synthesised}.{txt,json}`)
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(2)
})
