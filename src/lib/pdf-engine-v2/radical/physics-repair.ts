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

E. **🛑 BRIEF CONSTRAINTS ARE INVIOLABLE. NEVER mutate brief-pinned fields.**

   The user's brief explicitly fixes certain quantities — these are HARD CONSTRAINTS, not adjustable parameters. The user message will include a "BRIEF CONSTRAINTS — DO NOT VIOLATE" block listing every brief-pinned value. You MUST NOT emit patches that change:

   - structure_containment.canopy_area_m2 / growing_area_m2 (brief fixes canopy size)
   - structure_containment.container_length_mm / width_mm / height_mm (brief fixes envelope)
   - structure_containment.trolley_count / rack_count / module_count
   - quantity modifiers on container shells, trolleys, racks, cell modules
   - any module.derived_parameters key that corresponds to a brief-explicit value (target_performance, max_dimensions, target_canopy_m2, batch_size, unit_cost_ceiling, peak_power_kw if brief stated)

   If a finding can ONLY be fixed by changing a brief-pinned field (e.g. "yield target requires more canopy than the brief allows"), DO NOT emit scaling patches. Instead output:
   \`\`\`
   { "patches": [], "unfixable_reason": "requires brief revision: <which brief constraint and why>" }
   \`\`\`
   The chain will surface this as a brief-revision-needed manual review. DO NOT silently scale the design to satisfy physics by violating the brief.

   Example of the bug to AVOID: if brief says "100 m² canopy + 25 t/yr yield" and physics says "5× over leafy-green biological limit", the WRONG fix is "scale canopy 5× to 500 m²". The RIGHT response is "patches: [], unfixable_reason: requires brief revision: yield target 25 t/yr at 100 m² needs 250 kg/m²/yr but biological limit is 50 kg/m²/yr — yield target must drop to 5 t/yr OR canopy must grow (but canopy is brief-pinned at 100 m²)".

F. **Allowed mutation scope** — these are SAFE:
   - replace_modifier on part_number / manufacturer / rating_primary (swap wrong components for right ones)
   - replace_modifier on driver_power_w / fan_static_pressure_pa / pump_rated_bar / refrigerant (correct sizing without changing scale)
   - edit_word on name_human (clarify role)
   - add_word_to_sub_module for ADDING a missing safety/cooling/control component (e.g. add a chiller to a chilled-water loop that lacks one)
   - set_derived_parameter for non-brief-pinned fields (cooling_capacity_kw IF brief didn't pin it, refrigerant_charge_kg, etc.)

   These are FORBIDDEN without explicit brief permission:
   - replace_modifier on quantity (scaling component counts almost always violates brief)
   - set_derived_parameter on any brief-pinned field
   - add_word_to_sub_module that introduces a fundamentally different SCALE (e.g. adding a "second container" word)

G. **Output JSON**:
   \`\`\`
   {
     "patches": [<one or more patches>],
     "rationale": "<one sentence per patch explaining the swap>"
   }
   \`\`\`
   If the finding genuinely can't be fixed without violating the brief, output:
   \`\`\`
   { "patches": [], "unfixable_reason": "<which brief constraint blocks the fix, and what needs to change at the brief level>" }
   \`\`\`

H. **Cap**: max 4 patches per call. Be surgical.
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

/**
 * Format brief constraints as a "DO NOT VIOLATE" block for the repair
 * model's user message. Pulls every brief-pinned numeric / dimensional /
 * quantity field and lists them explicitly so the model can't claim
 * ignorance about which fields are mutable vs fixed.
 */
function formatBriefConstraintsBlock(brief: any): string {
  if (!brief || !brief.constraints) return 'BRIEF CONSTRAINTS: (none parsed — treat structure_containment.canopy_area_m2, container dimensions, trolley count as inviolable by default)'
  const c = brief.constraints
  const lines: string[] = ['BRIEF CONSTRAINTS — DO NOT VIOLATE. Patches that change any of these fields will be REJECTED:']
  if (c.target_performance?.value) {
    lines.push(`  • target_performance: ${c.target_performance.value} ${c.target_performance.unit ?? ''} (${c.target_performance.key_metric ?? 'metric'}) — DO NOT scale up design to meet a yield that exceeds physical limits; flag as unfixable instead`)
  }
  if (c.target_canopy_m2?.value) {
    lines.push(`  • target_canopy_m2: ${c.target_canopy_m2.value} m² (user-fixed canopy size — do NOT increase by adding containers/trolleys/racks)`)
  }
  if (c.max_dimensions_mm) {
    const d = c.max_dimensions_mm
    if (d.w || d.d || d.h) lines.push(`  • max_dimensions_mm: ${d.w ?? '?'} × ${d.d ?? '?'} × ${d.h ?? '?'} mm (envelope is brief-pinned)`)
  }
  if (c.max_mass_kg?.value) lines.push(`  • max_mass_kg: ${c.max_mass_kg.value} kg`)
  if (c.unit_cost_ceiling?.value) lines.push(`  • unit_cost_ceiling: £${c.unit_cost_ceiling.value} per unit`)
  if (c.batch_size?.value) lines.push(`  • batch_size: ${c.batch_size.value} units/year`)
  if (c.operating_environment) lines.push(`  • operating_environment: ${c.operating_environment.temp_min_c ?? '?'}-${c.operating_environment.temp_max_c ?? '?'} °C`)
  // Also extract numeric values from additional_constraints prose (these often
  // pin specific design choices like "18 kW peak refrigeration" or "8 mobile trolleys")
  if (Array.isArray(c.additional_constraints)) {
    for (const ac of c.additional_constraints) {
      if (ac?.description) lines.push(`  • additional: ${ac.description}`)
    }
  }
  lines.push('')
  lines.push('If a finding can only be resolved by changing one of the above, return { "patches": [], "unfixable_reason": "..." } — DO NOT emit scaling patches.')
  return lines.join('\n')
}

async function callRepairModel(opts: {
  finding: CritiqueIssue
  affectedSnippet: any  // the relevant module/sub_module/word JSON
  brief: any            // parsedBrief — passed through to format brief constraints
  apiKey: string
  model: string
  timeoutMs?: number
}): Promise<RepairResponseOut> {
  const briefBlock = formatBriefConstraintsBlock(opts.brief)
  const userContent = `${briefBlock}

PHYSICS-CRITIC FINDING TO FIX:

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

Emit the patch JSON now. Remember: if the only fix violates brief constraints, return unfixable_reason — do NOT silently scale up the design.`

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
 * Brief-constraint guard (added 2026-05-20 emergency hot-fix after verify
 * chain showed Physics Repair Loop scaled canopy_area_m2 from 100 → 672,
 * containers from 1 → 7, trolleys from 8 → 56 to "fix" a yield-vs-canopy
 * physics finding — should have declared unfixable instead).
 *
 * Returns a reject-reason string if the patch would violate a brief
 * constraint, or null if the patch is safe to apply.
 *
 * Rules:
 *  - Patches on structure_containment quantity fields (container count,
 *    trolley count, rack count) are REJECTED.
 *  - Patches on canopy_area_m2 / growing_area_m2 are REJECTED if a brief
 *    target exists (any value — assume brief pins it).
 *  - Patches on max_dimensions_mm-style fields are REJECTED.
 *  - Patches on cooling_capacity_kw are REJECTED if brief.additional_constraints
 *    mentions a peak refrigeration kW value.
 *  - Other patches pass through.
 */
function checkBriefConstraintViolation(brief: any, p: RepairPatchOut): string | null {
  const c = brief?.constraints
  if (!c) return null

  // Block any quantity mutation on structure_containment scale-bearing components
  if (p.op === 'replace_modifier' && p.module === 'structure_containment' && String(p.modifier_kind ?? '').toLowerCase() === 'quantity') {
    return `quantity mutation on structure_containment.${p.sub_module_id}.${p.word_id} violates brief envelope/count — declare unfixable instead`
  }

  // Block set_derived_parameter on canopy / growing area
  if (p.op === 'set_derived_parameter' && /^(canopy|growing|cultivation|productive)_area_m2$/.test(String(p.key ?? ''))) {
    return `set_derived_parameter on ${p.key} violates brief-pinned canopy area — declare unfixable instead`
  }

  // Block set_derived_parameter on container/envelope dimensions
  if (p.op === 'set_derived_parameter' && /(container|envelope)_(length|width|height|volume)/.test(String(p.key ?? ''))) {
    return `set_derived_parameter on ${p.key} violates brief-pinned envelope — declare unfixable instead`
  }

  // Block set_derived_parameter on trolley/rack/module count
  if (p.op === 'set_derived_parameter' && /^(trolley_count|rack_count|module_count|cells_per_module|cell_count)$/.test(String(p.key ?? ''))) {
    return `set_derived_parameter on ${p.key} violates brief unit count — declare unfixable instead`
  }

  // Block adding a new container/trolley word (different scale)
  if (p.op === 'add_word_to_sub_module' && p.module === 'structure_containment') {
    const newName = String(p.new_word?.name_human ?? p.new_word?.id ?? '').toLowerCase()
    if (/(container|shell|trolley|rack)/.test(newName)) {
      return `add_word "${newName}" to structure_containment introduces new envelope/scale — declare unfixable instead`
    }
  }

  // Block target_performance value mutation (if a brief target exists)
  if (p.op === 'set_derived_parameter' && /^(target_performance|target_yield|annual_yield)/.test(String(p.key ?? ''))) {
    if (c.target_performance?.value !== undefined) {
      return `set_derived_parameter on ${p.key} would override brief.target_performance — declare unfixable instead`
    }
  }

  // ITER-10.5 Sprint 2A (Tristan 2026-05-20): block mutation of
  // performance-defining derived parameters. The chain on iter-10.5-v2 run
  // emitted "LED installed power 0.9 kW" for a 100 m² growing area
  // (commercial leafy-greens typical 200-300 W/m² → 20-30 kW). The Physics
  // Repair Loop accepted that as fine because no guard prevented it from
  // SLASHING the LED power to make some other arithmetic work.
  //
  // Rule (universal across product classes): mutations on the
  // performance-defining keys below are rejected. If physics says LED is
  // wrong, the fix is to pick a DIFFERENT LED model with appropriate
  // total power — not to slash the total power to make an arithmetic gate
  // pass. Same applies to yield density, energy-per-kg, water-per-kg.
  // These keys are not always brief-pinned but their values flow from
  // brief-pinned inputs (canopy × density = total yield), so allowing the
  // repair loop to mutate them defeats brief-constraint propagation.
  const perfKeyRe = /^(led_installed_power_kw|total_led_power_kw|led_power_density_kw_per_m2|peak_led_power_kw|photon_flux_umol_per_m2_s|ppfd_umol_per_m2_s|canopy_ppfd_umol_per_m2_s|yield_density_kg_per_m2_per_year|yield_kg_per_m2_per_year|energy_per_kg_kwh|water_per_kg_l|peak_electrical_load_kw|sensible_heat_load_kw|cooling_capacity_kw)$/
  if (p.op === 'set_derived_parameter' && perfKeyRe.test(String(p.key ?? ''))) {
    return `set_derived_parameter on ${p.key} violates brief-driven performance value — pick a different component with the right rating instead of mutating the derived parameter`
  }

  return null
}

/**
 * Apply a physics-repair patch directly to the modules tree. Returns true
 * if applied. We don't go through universal-repair.ts:applyPatches() because
 * that uses numeric-index paths (`sub_modules[3].words[7]`) which require
 * pre-resolution, whereas physics-critic findings reference parts by id
 * (`led_driver_320w_word`). Direct id-based traversal is simpler.
 *
 * Manual-sourcing flags are logged but don't mutate state.
 *
 * 2026-05-20 hot-fix: pre-apply brief-constraint check rejects patches that
 * would violate the brief (canopy mutations, container quantity scaling,
 * envelope dimension changes, etc.).
 */
function applyPhysicsRepairPatch(modules: ModuleSpec[], p: RepairPatchOut, brief: any, log: string[]): boolean {
  const briefViolation = checkBriefConstraintViolation(brief, p)
  if (briefViolation) {
    log.push(`REJECT (brief-violation): ${briefViolation}`)
    return false
  }
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
      brief: opts.brief,  // brief constraints passed through for "DO NOT VIOLATE" block (2026-05-20 hot-fix)
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
      if (applyPhysicsRepairPatch(currentModules, p, opts.brief, applyLog)) appliedThisIter++
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
