#!/usr/bin/env npx tsx
/**
 * scripts/cross-module-validate-repair.tsx
 *
 * Tristan 2026-05-13: deterministic cross-module validator + Grok 4.3 repair.
 *
 * Catches the kind of cross-module inconsistencies that anchor-mode synthesis
 * misses (because it scores each module independently):
 *   - shared field disagreement (rack_count, dc_bus_voltage_v, etc.)
 *   - derived relations (power_kw / voltage_v = current_a)
 *   - brief-stated constraints not present in any module
 *
 * Pipeline:
 *   1. Read state.json
 *   2. Run deterministic checks → list of violations
 *   3. If any violations: Grok 4.3 receives brief + modules + violations,
 *      returns corrected modules (numbers fixed, prose updated to match).
 *   4. Re-validate. Save state-corrected.json. Re-render PDF.
 *
 * Usage:
 *   npx tsx scripts/cross-module-validate-repair.tsx <state.json> <brief.md> <out-dir>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'
import { execFileSync } from 'child_process'

for (const envPath of [
  resolve(process.cwd(), '.env.local'),
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
  } catch { /* ok */ }
}

const GROK_4_3 = 'x-ai/grok-4.3'

interface Module {
  module: string
  module_brief?: string
  overview_paragraph_en?: string
  derived_parameters?: Record<string, number | string>
  sub_modules?: any[]
}

interface Violation {
  severity: 'error' | 'warn'
  kind: string
  message: string
}

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function approxEqual(a: number, b: number, tolPct = 0.02): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) <= tolPct
}

// ─── Validator ──────────────────────────────────────────────────────────────

function validate(modules: Module[], brief: string): Violation[] {
  const violations: Violation[] = []
  const byId = new Map<string, Module>(modules.map(m => [m.module, m]))

  // Helper to read a numeric field from a module, with synonyms
  function readNum(m: Module | undefined, ...keys: string[]): number | null {
    if (!m?.derived_parameters) return null
    for (const k of keys) {
      const v = num(m.derived_parameters[k])
      if (v !== null) return v
    }
    return null
  }

  const ess = byId.get('energy_storage_source')
  const ect = byId.get('energy_conversion_transduction')
  const pd = byId.get('power_distribution')
  const sc = byId.get('structure_containment')

  // ── Check 1: energy arithmetic in ess closes
  if (ess?.derived_parameters) {
    const cells = readNum(ess, 'cell_count')
    const Ah = readNum(ess, 'cell_capacity_ah', 'cell_ah')
    const V = readNum(ess, 'cell_voltage_v', 'cell_voltage_nominal_v')
    const totalKwh = readNum(ess, 'capacity_kwh_total', 'capacity_kwh_gross', 'nameplate_capacity_kwh')
    if (cells && Ah && V && totalKwh) {
      const product = (cells * Ah * V) / 1000
      if (!approxEqual(product, totalKwh, 0.02)) {
        violations.push({
          severity: 'error',
          kind: 'arithmetic_capacity',
          message: `energy_storage_source: cell_count × cell_capacity_ah × cell_voltage_v / 1000 = ${product.toFixed(0)} kWh but capacity_kwh_total = ${totalKwh} (off by ${(Math.abs(product - totalKwh) / totalKwh * 100).toFixed(1)}%)`,
        })
      }
    }
  }

  // ── Check 2: module × cells_per_module = cell_count
  if (ess?.derived_parameters) {
    const cells = readNum(ess, 'cell_count')
    const mods = readNum(ess, 'module_count', 'modules_count')
    const cpm = readNum(ess, 'cells_per_module')
    if (cells && mods && cpm && mods * cpm !== cells) {
      violations.push({
        severity: 'error',
        kind: 'arithmetic_cell_count',
        message: `energy_storage_source: module_count (${mods}) × cells_per_module (${cpm}) = ${mods * cpm} but cell_count = ${cells}`,
      })
    }
  }

  // ── Check 3: DC bus voltage consistent across modules
  const dcVoltages: Array<{ mod: string; v: number }> = []
  for (const m of modules) {
    const v = readNum(m, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v', 'dc_input_voltage_v', 'nominal_voltage_v')
    if (v !== null) dcVoltages.push({ mod: m.module, v })
  }
  if (dcVoltages.length >= 2) {
    const ref = dcVoltages[0].v
    for (const d of dcVoltages.slice(1)) {
      if (!approxEqual(d.v, ref, 0.02)) {
        violations.push({
          severity: 'error',
          kind: 'cross_module_voltage_mismatch',
          message: `DC bus voltage: ${dcVoltages[0].mod}=${ref} V but ${d.mod}=${d.v} V (>2% apart)`,
        })
      }
    }
  }

  // ── Check 4: DC bus current handles peak power
  if (ect && pd) {
    const peakKw = readNum(ect, 'rated_power_peak_kw')
    const dcV = readNum(ect, 'dc_input_voltage_v') ?? readNum(ess, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v')
    const busA = readNum(pd, 'dc_bus_rating_a')
    if (peakKw && dcV && busA) {
      const requiredA = (peakKw * 1000) / dcV
      if (busA < requiredA * 0.98) {  // allow 2% buffer for ratings convention
        violations.push({
          severity: 'error',
          kind: 'dc_bus_under_rated',
          message: `power_distribution.dc_bus_rating_a = ${busA} A, but peak ${peakKw} kW / ${dcV} V = ${requiredA.toFixed(0)} A required (bus undersized by ${((requiredA - busA) / requiredA * 100).toFixed(0)}%)`,
        })
      }
    }
  }

  // ── Check 5: rack_count consistent (when it appears in multiple modules)
  const racks: Array<{ mod: string; n: number }> = []
  for (const m of modules) {
    const n = readNum(m, 'rack_count')
    if (n !== null) racks.push({ mod: m.module, n })
  }
  if (racks.length >= 2) {
    const ref = racks[0].n
    for (const r of racks.slice(1)) {
      if (r.n !== ref) {
        violations.push({
          severity: 'warn',
          kind: 'rack_count_terminology_mismatch',
          message: `rack_count: ${racks[0].mod}=${ref} but ${r.mod}=${r.n}. If these refer to different things (battery vs control racks), rename one.`,
        })
      }
    }
  }

  // ── Check 6: brief-stated constraints present
  const reqs: Array<{ label: string; check: () => boolean }> = [
    { label: '3.5 MWh usable', check: () => {
      const u = readNum(ess, 'usable_capacity_kwh', 'capacity_kwh_usable', 'capacity_kwh')
      return u !== null && approxEqual(u, 3500, 0.03)
    }},
    { label: '1 MW continuous', check: () => {
      const p = readNum(ect, 'rated_power_continuous_kw', 'continuous_power_mw', 'rated_power_kw')
      if (p === null) return false
      const pkw = p < 100 ? p * 1000 : p  // MW → kW if expressed in MW
      return approxEqual(pkw, 1000, 0.02)
    }},
    { label: '1.25 MW peak', check: () => {
      const p = readNum(ect, 'rated_power_peak_kw', 'peak_power_mw')
      if (p === null) return false
      const pkw = p < 100 ? p * 1000 : p
      return approxEqual(pkw, 1250, 0.02)
    }},
    { label: '800 V DC bus', check: () => {
      const v = readNum(ess, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v')
      return v !== null && approxEqual(v, 800, 0.02)
    }},
    { label: '28,000 kg mass', check: () => {
      const m = readNum(sc, 'max_mass_kg', 'mass_kg', 'gross_mass_kg')
      return m !== null && approxEqual(m, 28000, 0.05)
    }},
    { label: '40-ft ISO container dimensions', check: () => {
      const L = readNum(sc, 'container_length_m', 'envelope_length_m', 'length_m')
      return L !== null && approxEqual(L, 12.192, 0.02)
    }},
    { label: '6,000 design cycles', check: () => {
      const c = readNum(ess, 'design_life_cycles', 'design_cycles', 'cycle_life')
      return c !== null && approxEqual(c, 6000, 0.05)
    }},
    { label: '280 Ah cells', check: () => {
      const a = readNum(ess, 'cell_capacity_ah', 'cell_ah')
      return a !== null && approxEqual(a, 280, 0.02)
    }},
  ]
  for (const r of reqs) {
    if (!r.check()) {
      violations.push({
        severity: 'warn',
        kind: 'brief_constraint_missing',
        message: `Brief constraint not present in any module derived_parameters: ${r.label}`,
      })
    }
  }

  return violations
}

// ─── Grok 4.3 repair ─────────────────────────────────────────────────────────

async function callGrok(systemPrompt: string, userContent: string, maxTokens = 150_000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 900_000)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROK_4_3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${await response.text().catch(() => '?')}`)
  }
  const json = await response.json() as any
  return (json.choices?.[0]?.message?.content ?? '').trim()
}

function parseJsonLoose(raw: string): any {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  try { return JSON.parse(s) } catch {}
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 200)}`)
}

async function repairWithGrok(modules: Module[], violations: Violation[], brief: string): Promise<Module[]> {
  const systemPrompt = `You are a senior systems engineer correcting cross-module engineering inconsistencies in a hardware product decomposition. The decomposition has already passed per-module arithmetic checks; you are fixing inconsistencies BETWEEN modules + missing brief constraints.

YOUR EDIT POLICY:
- For each violation listed by the validator, edit the relevant module's derived_parameters and overview_paragraph_en + sub_module sentences to resolve it.
- Make the minimum number of changes needed. Prefer adjusting numbers over restructuring modules.
- Keep all module IDs, sub_module IDs, and sub_module names intact.
- Where two modules disagree on a shared quantity (e.g. dc_bus_voltage_v), pick the value that best satisfies the brief and apply consistently.
- For brief-stated constraints that are missing, add the relevant key to the appropriate module's derived_parameters.
- For under-rated buses/currents: increase the rating to handle peak load with at least 10% margin.
- Update any prose mentions that reference the changed numbers.

Return the FULL corrected JSON modules array (top-level: { "modules": [...] }). Same shape, all 10 modules present, every field preserved unless fixing a violation requires changing it. Output ONLY the JSON, no preamble, no markdown fences.`

  const userContent = `BRIEF:
${brief}

MODULES TO CORRECT:
${JSON.stringify({ modules }, null, 2)}

VIOLATIONS FROM DETERMINISTIC VALIDATOR (must all be resolved):
${violations.map(v => `- [${v.severity.toUpperCase()} / ${v.kind}] ${v.message}`).join('\n')}

Return the corrected modules JSON.`

  console.error(`[validate-repair] calling Grok 4.3 with ${violations.length} violations...`)
  const t0 = Date.now()
  const raw = await callGrok(systemPrompt, userContent)
  console.error(`[validate-repair] Grok responded in ${Date.now() - t0}ms (${raw.length} chars)`)
  const parsed = parseJsonLoose(raw)
  if (!parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('Grok did not return a modules array')
  }
  return parsed.modules as Module[]
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 3) {
    console.error('Usage: cross-module-validate-repair.tsx <state.json> <brief.md> <out-dir>')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const briefPath = resolve(args[1])
  const outDir = resolve(args[2])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const brief = readFileSync(briefPath, 'utf-8')

  const modules: Module[] = state.moduleDecomposition?.modules ?? []
  console.error(`[validate-repair] modules: ${modules.length}`)

  const before = validate(modules, brief)
  console.error(`\n=== VIOLATIONS BEFORE ===`)
  for (const v of before) console.error(`[${v.severity.toUpperCase()}] ${v.kind}: ${v.message}`)
  console.error(`Total: ${before.length} (errors: ${before.filter(v => v.severity === 'error').length}, warns: ${before.filter(v => v.severity === 'warn').length})`)
  writeFileSync(resolve(outDir, 'violations-before.json'), JSON.stringify(before, null, 2))

  if (before.length === 0) {
    console.error('\n[validate-repair] no violations — state is already clean. Copying through.')
    writeFileSync(resolve(outDir, 'state-corrected.json'), JSON.stringify(state, null, 2))
  } else {
    const repaired = await repairWithGrok(modules, before, brief)

    const after = validate(repaired, brief)
    console.error(`\n=== VIOLATIONS AFTER REPAIR ===`)
    for (const v of after) console.error(`[${v.severity.toUpperCase()}] ${v.kind}: ${v.message}`)
    console.error(`Total: ${after.length} (errors: ${after.filter(v => v.severity === 'error').length}, warns: ${after.filter(v => v.severity === 'warn').length})`)
    console.error(`Δ resolved: ${before.length - after.length}`)
    writeFileSync(resolve(outDir, 'violations-after.json'), JSON.stringify(after, null, 2))

    const correctedState = {
      ...state,
      moduleDecomposition: {
        ...state.moduleDecomposition,
        modules: repaired,
      },
      naturalLanguageLayer: state.naturalLanguageLayer,  // unchanged (per-sub-module sentences)
      savedAt: new Date().toISOString(),
    }

    // Re-build natural-language layer from repaired modules so overview_paragraph_en updates land
    try {
      const { buildNaturalLanguageLayer } = await import('../src/lib/pdf-engine-v2/radical/sentence-generator')
      correctedState.naturalLanguageLayer = buildNaturalLanguageLayer(repaired as any)
      // Carry overview_paragraph_en into paragraph_en_llm for the renderer
      for (const m of repaired) {
        const nl = correctedState.naturalLanguageLayer.by_module[m.module]
        if (nl && m.overview_paragraph_en) (nl as any).paragraph_en_llm = m.overview_paragraph_en
      }
    } catch (err) {
      console.warn('[validate-repair] could not rebuild naturalLanguageLayer:', err)
    }

    writeFileSync(resolve(outDir, 'state-corrected.json'), JSON.stringify(correctedState, null, 2))
  }

  // Render PDF
  const finalState = resolve(outDir, 'state-corrected.json')
  const pdfPath = resolve(outDir, 'path-a-validated.pdf')
  console.error(`\n[validate-repair] rendering ${pdfPath}...`)
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), finalState, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  execFileSync('open', [pdfPath])
  console.error(`[validate-repair] opened ${pdfPath}`)
}

main().catch(err => {
  console.error('[validate-repair] FATAL:', err)
  process.exit(1)
})
