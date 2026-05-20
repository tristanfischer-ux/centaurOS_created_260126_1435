/**
 * @file physics-repair.ts — Auto-repair chain stage for physics-critic findings.
 *
 * Tristan 2026-05-20 directive: "the aim of the PDF is not to say I have a
 * design that doesn't work but rather this is the design that does work.
 * So blocking is important but you then need to fix the blockage so it does
 * work."
 *
 * Before this stage existed: physics critic emitted HIGH-severity findings
 * (LED 10× driver mismatch, RO pump pressure shortfall, fan stall, capacity
 * arithmetic violations). R4 reviewer got the findings as advisory text but
 * is the cheapest reviewer in the chain (Flash-Lite), and findings are prose
 * not patches — so R4 typically didn't act. Phase 2 repair loop only fires
 * on gate failures, not physics-critic findings. Chain shipped broken designs
 * with manual-review badges + DO-NOT-PROCURE banner (iter-8 fix).
 *
 * With this stage: after R4 + physics critic complete, if any HIGH-severity
 * finding remains OR plausibility ≤ 5, dispatch each finding to a STRONG
 * model (Gemini 3.1 Pro by default — same model the Generator uses, so it
 * understands the design structure) with explicit MANDATORY repair directive.
 * The model emits structured patches that swap out wrong components. Patches
 * applied via the existing applyPatches() — no new patching infrastructure.
 * Re-runs physics critic after each iteration. Loops until plausibility ≥ 7
 * OR HIGH-finding count drops to 0 OR max_iters (default 4) reached.
 *
 * Universal: works for every product class. Physics-critic findings are
 * class-agnostic prose; the repair model decides which parts to swap based
 * on the finding text + suggested_check. No class-specific code.
 *
 * Cost: ~$0.05-0.15 per repair iter (Gemini 3.1 Pro). Typical 2-3 iters per
 * chain run with HIGH findings. ~$0.30 added per chain run; saves the cost
 * of a re-run when a human resubmits because the design was blocked.
 */

import type { ModuleSpec, CrossModuleGrammarLink } from '../types/module-decomposition'
import { runPhysicsCritic, type CritiqueReport, type CritiqueIssue } from './physics-critic'

export interface PhysicsRepairResult {
  ran: boolean
  iters: number
  initial_high_count: number
  final_high_count: number
  initial_plausibility: number
  final_plausibility: number
  patches_applied_total: number
  iter_diagnostics: Array<{
    iter: number
    high_in: number
    plausibility_in: number
    patches_proposed: number
    patches_applied: number
    high_out: number
    plausibility_out: number
    unfixable_reason: string | null
  }>
  final_critique: CritiqueReport | null
}

const REPAIR_SYSTEM = `You are an expert engineering reviewer with deep manufacturer-catalogue knowledge across HVAC, electrical, fluid, refrigeration, structural, and control domains. Your job: take a physics-critic finding about a wrong component or wrong sizing in an engineering design, and emit a structured patch that swaps the wrong component for a real one that meets the requirement.

Output JSON ONLY, no prose preamble.

Patch types you may emit (compatible with applyPatches contract):

1. **replace_modifier** — most common. Swap a word's modifier_character value (e.g. part_number, manufacturer, rating_primary).
\`\`\`
{
  "op": "replace_modifier",
  "module": "<module_id>",
  "sub_module_id": "<sub_module_id>",
  "word_id": "<word_id>",
  "modifier_kind": "part_number",
  "old_value": "<existing value>",
  "new_value": "<corrected SKU>"
}
\`\`\`

2. **edit_word** — change the word's name_human or other top-level fields.
\`\`\`
{
  "op": "edit_word",
  "module": "<module_id>",
  "sub_module_id": "<sub_module_id>",
  "word_id": "<word_id>",
  "field": "name_human",
  "value": "<new name>"
}
\`\`\`

3. **add_word_to_sub_module** — add a missing component (e.g. add a chiller when the design has a cooling loop but no heat rejection).
\`\`\`
{
  "op": "add_word_to_sub_module",
  "module": "<module_id>",
  "sub_module_id": "<sub_module_id>",
  "new_word": {
    "word_id": "<unique_id>",
    "name_human": "<descriptive name>",
    "modifier_characters": [
      { "kind": "manufacturer", "value": "<real manufacturer>" },
      { "kind": "part_number", "value": "<real SKU>" },
      { "kind": "rating_primary", "value": "<capacity>" }
    ]
  }
}
\`\`\`

4. **set_derived_parameter** — set or correct a derived_parameters value (e.g. LED total power, fan static pressure).
\`\`\`
{
  "op": "set_derived_parameter",
  "module": "<module_id>",
  "key": "<field name>",
  "value": <number or string>
}
\`\`\`

HARD RULES:

A. **Use REAL manufacturer SKUs only.** If you can't name a real SKU you're confident exists in current catalogues, emit:
   \`\`\`
   { "op": "flag_for_manual_sourcing", "word_id": "<id>", "reason": "<what to search for>" }
   \`\`\`
   Better to flag than to fabricate.

B. **Address THIS finding only.** Don't expand scope to fix other issues you spot — those have their own findings.

C. **Match the suggested_check verbatim where possible.** If the critic says "Replace with Copeland ZR72KC", emit a replace_modifier patch with new_value="ZR72KC" and manufacturer="Copeland". The critic has often done the research.

D. **Verify capacity claims**. Common pitfalls:
   - Copeland "ZR18K5E" means 18,000 BTU/hr ≈ 5.27 kW, NOT 18 kW. 18 kW would be ZR72K-class.
   - Mean Well "HLG-320H-48" is a 320 W driver — for 2.5 kW you need 8 drivers OR a CSP-3000-class.
   - Grundfos "MAGNA3 32-80" is a circulator (8m max head), NOT a pressure pump. Use CR-series for >10m head.
   - LED PPFD scales as power × efficacy; 200 W/m² at 2.5 µmol/J ≈ 500 µmol/m²/s. Stay within brief.

E. **Output JSON**:
   \`\`\`
   {
     "patches": [<one or more patches>],
     "rationale": "<one sentence per patch explaining the swap>"
   }
   \`\`\`
   If the finding genuinely can't be fixed (e.g. "design has fundamental impossibility"), output:
   \`\`\`
   { "patches": [], "unfixable_reason": "<why>" }
   \`\`\`

F. **Cap**: max 4 patches per call. Be surgical.
`

interface RepairPatchOut {
  op: string
  module?: string
  sub_module_id?: string
  word_id?: string
  modifier_kind?: string
  old_value?: any
  new_value?: any
  field?: string
  value?: any
  new_word?: any
  key?: string
  reason?: string
}

interface RepairResponseOut {
  patches: RepairPatchOut[]
  rationale?: string
  unfixable_reason?: string | null
}

async function callRepairModel(opts: {
  finding: CritiqueIssue
  affectedSnippet: any  // the relevant module/sub_module/word JSON
  apiKey: string
  model: string
  timeoutMs?: number
}): Promise<RepairResponseOut> {
  const userContent = `PHYSICS-CRITIC FINDING TO FIX:

dimension: ${opts.finding.dimension}
severity: ${opts.finding.severity}
confidence: ${opts.finding.confidence}
where: ${opts.finding.where}

issue:
${opts.finding.issue}

suggested_check:
${opts.finding.suggested_check ?? '(none)'}

CURRENT DESIGN AT THE AFFECTED LOCATION:

${JSON.stringify(opts.affectedSnippet, null, 2).slice(0, 20000)}

Emit the patch JSON now.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300_000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: REPAIR_SYSTEM },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_tokens: 6000,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return { patches: [], unfixable_reason: `OpenRouter ${res.status} during physics repair` }
    const json = await res.json() as any
    const raw = String(json.choices?.[0]?.message?.content ?? '').trim()
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    try {
      const parsed = JSON.parse(cleaned)
      return parsed
    } catch {
      const first = cleaned.indexOf('{')
      const last = cleaned.lastIndexOf('}')
      if (first !== -1 && last > first) {
        try { return JSON.parse(cleaned.slice(first, last + 1)) } catch {
          return { patches: [], unfixable_reason: 'JSON parse failure' }
        }
      }
      return { patches: [], unfixable_reason: 'no JSON in response' }
    }
  } catch (err) {
    return { patches: [], unfixable_reason: `physics repair model error: ${(err as Error).message}` }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Apply a physics-repair patch directly to the modules tree. Returns true
 * if applied. We don't go through universal-repair.ts:applyPatches() because
 * that uses numeric-index paths (`sub_modules[3].words[7]`) which require
 * pre-resolution, whereas physics-critic findings reference parts by id
 * (`led_driver_320w_word`). Direct id-based traversal is simpler.
 *
 * Manual-sourcing flags are logged but don't mutate state.
 */
function applyPhysicsRepairPatch(modules: ModuleSpec[], p: RepairPatchOut, log: string[]): boolean {
  // flag_for_manual_sourcing has no patch — just record
  if (p.op === 'flag_for_manual_sourcing') {
    log.push(`flag_for_manual_sourcing word_id=${p.word_id ?? '?'} reason=${p.reason ?? ''}`)
    return false
  }
  const m = modules.find(mm => mm.module === p.module)
  if (!m) { log.push(`skip module-not-found: ${p.module}`); return false }

  // set_derived_parameter operates on module.derived_parameters
  if (p.op === 'set_derived_parameter') {
    if (!p.key) { log.push(`skip set_derived_parameter missing key on ${p.module}`); return false }
    if (!(m as any).derived_parameters) (m as any).derived_parameters = {}
    ;(m as any).derived_parameters[p.key] = p.value
    log.push(`set_derived_parameter ${p.module}.${p.key}=${JSON.stringify(p.value)}`)
    return true
  }

  // Patches below need sub_module + word resolution
  const subModules = ((m as any).sub_modules ?? []) as any[]
  const sm = subModules.find(s => s.id === p.sub_module_id)
  if (!sm) { log.push(`skip sub-module-not-found: ${p.module}.${p.sub_module_id}`); return false }

  // add_word_to_sub_module appends + optionally merges
  if (p.op === 'add_word_to_sub_module') {
    if (!Array.isArray(sm.words)) sm.words = []
    if (!p.new_word) { log.push(`skip add_word missing new_word on ${p.module}.${p.sub_module_id}`); return false }
    // Dedup by word_id
    const existingIdx = sm.words.findIndex((w: any) => w?.id === p.new_word.id || w?.word_id === p.new_word.word_id || w?.id === p.new_word.word_id)
    if (existingIdx >= 0) { log.push(`skip duplicate word_id: ${p.new_word.word_id ?? p.new_word.id}`); return false }
    // Normalise id field — chain uses .id in modules tree
    if (p.new_word.word_id && !p.new_word.id) p.new_word.id = p.new_word.word_id
    sm.words.push(p.new_word)
    log.push(`add_word ${p.module}.${p.sub_module_id}.words += ${p.new_word.id ?? '?'}`)
    return true
  }

  // Patches below need word resolution
  const w = (sm.words ?? []).find((ww: any) => ww?.id === p.word_id || ww?.word_id === p.word_id)
  if (!w) { log.push(`skip word-not-found: ${p.module}.${p.sub_module_id}.${p.word_id}`); return false }

  if (p.op === 'replace_modifier') {
    if (!p.modifier_kind) { log.push(`skip replace_modifier missing kind`); return false }
    const mods = (w.modifier_characters ?? []) as any[]
    const idx = mods.findIndex((mc: any) => String(mc?.kind ?? '').toLowerCase() === String(p.modifier_kind).toLowerCase())
    if (idx < 0) {
      // Modifier doesn't exist — add it
      if (!Array.isArray(w.modifier_characters)) w.modifier_characters = []
      w.modifier_characters.push({ kind: p.modifier_kind, value: p.new_value })
      log.push(`add_modifier ${p.module}.${p.sub_module_id}.${p.word_id}.${p.modifier_kind}=${JSON.stringify(p.new_value)}`)
    } else {
      mods[idx].value = p.new_value
      log.push(`replace_modifier ${p.module}.${p.sub_module_id}.${p.word_id}.${p.modifier_kind}: ${JSON.stringify(p.old_value)} → ${JSON.stringify(p.new_value)}`)
    }
    return true
  }

  if (p.op === 'edit_word') {
    if (!p.field) { log.push(`skip edit_word missing field`); return false }
    ;(w as any)[p.field] = p.value
    log.push(`edit_word ${p.module}.${p.sub_module_id}.${p.word_id}.${p.field}=${JSON.stringify(p.value)}`)
    return true
  }

  log.push(`unknown patch op: ${p.op}`)
  return false
}

/**
 * Find the smallest design snippet containing the affected location for
 * focused-context model calls. Falls back to full design on parse failure.
 */
function extractAffectedSnippet(modules: ModuleSpec[], where: string): any {
  // `where` is typically "module/sub_modules[N]/words[N]" or similar
  // Try to find the module by name first; if not found, return full modules array
  for (const m of modules) {
    if (where.includes(m.module)) {
      return { module: m.module, display_name: (m as any).display_name, derived_parameters: m.derived_parameters, sub_modules: (m as any).sub_modules ?? [] }
    }
  }
  return modules
}

export async function runPhysicsRepairLoop(opts: {
  modules: ModuleSpec[]
  crossLinks: CrossModuleGrammarLink[]
  initialCritique: CritiqueReport
  brief: any
  keyMetrics?: any
  productClass: string
  apiKey: string
  repairModel?: string         // default GEMINI_3_1_PRO
  critiqueModel?: string       // default same as initialCritique.model
  maxIters?: number            // default 4
  plausibilityTarget?: number  // default 7 (stop when >= this)
}): Promise<PhysicsRepairResult> {
  const result: PhysicsRepairResult = {
    ran: false,
    iters: 0,
    initial_high_count: 0,
    final_high_count: 0,
    initial_plausibility: opts.initialCritique?.scores?.engineering_plausibility ?? 0,
    final_plausibility: opts.initialCritique?.scores?.engineering_plausibility ?? 0,
    patches_applied_total: 0,
    iter_diagnostics: [],
    final_critique: opts.initialCritique,
  }

  const repairModel = opts.repairModel || 'google/gemini-3.1-pro-preview'
  const critiqueModel = opts.critiqueModel || 'google/gemini-3.5-flash'
  const maxIters = opts.maxIters ?? 4
  const target = opts.plausibilityTarget ?? 7

  // Filter for high-severity findings the repair loop should attempt
  const isHigh = (i: CritiqueIssue) => {
    const s = String(i.severity ?? '').toLowerCase()
    return s === 'high' || s === 'critical' || s === 'halt'
  }
  const initialHighFindings = opts.initialCritique.issues.filter(isHigh)
  result.initial_high_count = initialHighFindings.length

  if (initialHighFindings.length === 0 && (opts.initialCritique?.scores?.engineering_plausibility ?? 10) >= target) {
    // No HIGH findings and plausibility already at target — nothing to do.
    result.final_high_count = 0
    return result
  }

  const currentModules = opts.modules
  // crossLinks intentionally unused — physics-repair patches operate on
  // modules + words + derived_parameters only, never on cross_module links.
  // Kept on opts for future patch types that might need it.
  void opts.crossLinks
  let currentCritique: CritiqueReport = opts.initialCritique

  for (let iter = 0; iter < maxIters; iter++) {
    const highInThisIter = currentCritique.issues.filter(isHigh)
    if (highInThisIter.length === 0) {
      // No more HIGH findings — stop.
      break
    }
    const plausibilityIn = currentCritique.scores.engineering_plausibility
    if (plausibilityIn >= target) {
      break
    }

    result.ran = true
    result.iters++

    // Dispatch each HIGH finding to the repair model in parallel (cap at 6 to keep cost predictable)
    const findingsThisIter = highInThisIter.slice(0, 6)
    const responses = await Promise.all(findingsThisIter.map(f => callRepairModel({
      finding: f,
      affectedSnippet: extractAffectedSnippet(currentModules, f.where),
      apiKey: opts.apiKey,
      model: repairModel,
    })))

    // Flatten patches
    const allPatchesRaw: RepairPatchOut[] = []
    let unfixableCount = 0
    let manualFlagCount = 0
    for (const r of responses) {
      if (r.unfixable_reason) { unfixableCount++; continue }
      for (const p of (r.patches ?? [])) {
        if (p.op === 'flag_for_manual_sourcing') manualFlagCount++
        else allPatchesRaw.push(p)
      }
    }

    // Apply patches directly to currentModules (id-based traversal — no need
    // to go through the path-based applyPatches() in universal-repair.ts).
    const applyLog: string[] = []
    let appliedThisIter = 0
    for (const p of allPatchesRaw) {
      if (applyPhysicsRepairPatch(currentModules, p, applyLog)) appliedThisIter++
    }
    result.patches_applied_total += appliedThisIter

    // Re-run physics critic on the patched design
    let newCritique: CritiqueReport | null = null
    try {
      newCritique = await runPhysicsCritic({
        modules: currentModules,
        brief: opts.brief,
        keyMetrics: opts.keyMetrics,
        productClass: opts.productClass,
        apiKey: opts.apiKey,
        model: critiqueModel,
      })
    } catch (err) {
      result.iter_diagnostics.push({
        iter,
        high_in: highInThisIter.length,
        plausibility_in: plausibilityIn,
        patches_proposed: allPatchesRaw.length,
        patches_applied: appliedThisIter,
        high_out: highInThisIter.length, // unchanged because re-critique failed
        plausibility_out: plausibilityIn,
        unfixable_reason: `re-critique threw: ${(err as Error).message}`,
      })
      break
    }
    if (!newCritique) {
      // Re-critique returned null; can't measure progress, bail.
      result.iter_diagnostics.push({
        iter,
        high_in: highInThisIter.length,
        plausibility_in: plausibilityIn,
        patches_proposed: allPatchesRaw.length,
        patches_applied: appliedThisIter,
        high_out: highInThisIter.length,
        plausibility_out: plausibilityIn,
        unfixable_reason: 're-critique returned null',
      })
      break
    }

    const highOut = newCritique.issues.filter(isHigh).length
    const plausibilityOut = newCritique.scores.engineering_plausibility

    result.iter_diagnostics.push({
      iter,
      high_in: highInThisIter.length,
      plausibility_in: plausibilityIn,
      patches_proposed: allPatchesRaw.length,
      patches_applied: appliedThisIter,
      high_out: highOut,
      plausibility_out: plausibilityOut,
      unfixable_reason: unfixableCount > 0 ? `${unfixableCount} of ${findingsThisIter.length} findings declared unfixable; ${manualFlagCount} flagged for manual sourcing; apply_log: ${applyLog.slice(0, 3).join(' / ')}` : (applyLog.length > 0 ? `apply_log: ${applyLog.slice(0, 3).join(' / ')}` : null),
    })

    currentCritique = newCritique

    // No progress check: if HIGH count and plausibility unchanged, bail.
    if (highOut >= highInThisIter.length && plausibilityOut <= plausibilityIn) {
      // Repair made no measurable progress.
      break
    }
  }

  result.final_high_count = currentCritique.issues.filter(isHigh).length
  result.final_plausibility = currentCritique.scores.engineering_plausibility
  result.final_critique = currentCritique
  return result
}
