#!/usr/bin/env npx tsx
/**
 * scripts/brief-prose-validate-repair.tsx
 *
 * Tristan 2026-05-13: catch drifts between briefOverviewProse and
 * moduleDecomposition. The holistic review checks module-to-module coherence
 * AND module-to-brief constraint coverage, but doesn't check that every
 * numerical claim in the brief overview prose is reflected in module data.
 *
 * Drifts this catches:
 *   - "~800 V nominal DC bus" in prose but modules carry 784 V (drift, force exact)
 *   - "£180,000 unit-cost ceiling" in prose but no module records it as data
 *   - Brief overview claims something that no module actually implements
 *
 * Pipeline:
 *   1. Deterministic checks against state.briefOverviewProse + brief
 *   2. Grok 4.3 repair pass (same pattern as cross-module-validate-repair)
 *   3. Save + render
 *
 * Usage:
 *   npx tsx scripts/brief-prose-validate-repair.tsx <state.json> <brief.md> <out-dir>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
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
  } catch {}
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
  suggested_fix: string
}

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function approxEqual(a: number, b: number, tolPct = 0.02): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) <= tolPct
}

// ─── Validator ──────────────────────────────────────────────────────────────

function validateBriefProseVsModules(state: any, brief: string): Violation[] {
  const v: Violation[] = []
  const modules: Module[] = state.moduleDecomposition?.modules ?? []
  const proseBlob = JSON.stringify(state.briefOverviewProse ?? {}).toLowerCase()

  const readNum = (mod: Module | undefined, ...keys: string[]): number | null => {
    if (!mod?.derived_parameters) return null
    for (const k of keys) {
      const n = num(mod.derived_parameters[k])
      if (n !== null) return n
    }
    return null
  }
  const byId = new Map(modules.map(m => [m.module, m]))
  const ess = byId.get('energy_storage_source')
  const sc = byId.get('structure_containment')
  const ms = byId.get('maintenance_serviceability')
  const ect = byId.get('energy_conversion_transduction')

  // ── 1. Cost ceiling ───────────────────────────────────────────────────────
  if (/180[\s,]?000|£180|180 000|cost ceiling|cost-ceiling/i.test(proseBlob) || brief.match(/180,?000/)) {
    let found = false
    for (const m of modules) {
      const dp = m.derived_parameters ?? {}
      for (const [k, val] of Object.entries(dp)) {
        if (typeof val === 'number' && approxEqual(val, 180000, 0.02) &&
            /cost|price|ceiling|target|budget|gbp/i.test(k)) {
          found = true
          break
        }
      }
      if (found) break
    }
    if (!found) {
      v.push({
        severity: 'error',
        kind: 'cost_ceiling_not_in_data',
        message: 'Brief and brief overview prose state £180,000 unit-cost ceiling, but no module derived_parameters carries this value.',
        suggested_fix: 'Add `unit_cost_ceiling_gbp: 180000` to maintenance_serviceability.derived_parameters (or a more apt module).',
      })
    }
  }

  // ── 2. DC bus voltage — brief says ~800 V, force exact ±0.5% ─────────────
  const briefDcV = 800
  const dcV = readNum(ess, 'dc_bus_voltage_v', 'dc_bus_voltage_nominal_v') ?? readNum(ect, 'dc_input_voltage_v')
  if (dcV !== null && !approxEqual(dcV, briefDcV, 0.005)) {
    v.push({
      severity: 'error',
      kind: 'dc_bus_voltage_drift_from_brief',
      message: `Brief overview prose states "~800 V nominal DC bus" but design has ${dcV} V (${((dcV - briefDcV) / briefDcV * 100).toFixed(1)}% off). The "~" allows ±5%, but designing exactly to brief is preferred when feasible.`,
      suggested_fix: `Adjust the cell-string topology so the nominal DC bus is exactly 800 V. Easiest: 250 cells in series (instead of 245) × 3.2 V = 800 V. Update modules_per_string, cells_per_module, and cell_count accordingly. Update dc_bus_voltage_v in every module that references it (energy_storage_source, energy_conversion_transduction, power_distribution). Update overview_paragraph_en mentions.`,
    })
  }

  // ── 3. Brief overview claims that need to be reflected in module data ────
  // Each tuple: pattern in prose → field in some module
  const proseClaims: Array<{
    label: string
    proseRegex: RegExp
    inferData: () => boolean
    fix: string
  }> = [
    {
      label: 'liquid-cooled thermal management',
      proseRegex: /liquid[-\s]cooled|liquid cool/i,
      inferData: () => {
        const env = byId.get('environmental_interface')
        const hasCoolant = JSON.stringify(env?.sub_modules ?? []).toLowerCase().includes('coolant') ||
          JSON.stringify(env?.sub_modules ?? []).toLowerCase().includes('glycol')
        const battery_coldplate = JSON.stringify(ess?.sub_modules ?? []).toLowerCase().includes('cold_plate') ||
          JSON.stringify(ess?.sub_modules ?? []).toLowerCase().includes('coldplate') ||
          JSON.stringify(ess?.sub_modules ?? []).toLowerCase().includes('liquid')
        return hasCoolant && battery_coldplate
      },
      fix: 'Add coldplate + manifold + pump parts to environmental_interface or energy_storage_source.battery_cooling sub-module.',
    },
    {
      label: 'fire detection and suppression',
      proseRegex: /fire detection|fire suppression/i,
      inferData: () => {
        const safety = byId.get('safety_protection')
        const blob = JSON.stringify(safety?.sub_modules ?? []).toLowerCase()
        return blob.includes('fire') && (blob.includes('suppress') || blob.includes('aerosol') || blob.includes('alarm'))
      },
      fix: 'Add fire_suppression sub-module to safety_protection with suppression units, fire alarm control panel, alarms.',
    },
    {
      label: 'energy management system',
      proseRegex: /\bems\b|energy management/i,
      inferData: () => {
        const ccc = byId.get('control_compute_communication')
        const blob = JSON.stringify(ccc?.sub_modules ?? []).toLowerCase()
        return blob.includes('ems') || blob.includes('energy_management')
      },
      fix: 'Add ems_master + ems_controller sub-modules to control_compute_communication.',
    },
    {
      label: 'battery management system',
      proseRegex: /\bbms\b|battery management/i,
      inferData: () => {
        const blob = JSON.stringify(ess?.sub_modules ?? []).toLowerCase()
        return blob.includes('bms')
      },
      fix: 'Add bms_master + bms_slave sub-modules to energy_storage_source.',
    },
  ]

  for (const c of proseClaims) {
    if (c.proseRegex.test(proseBlob) && !c.inferData()) {
      v.push({
        severity: 'error',
        kind: 'prose_claims_not_in_modules',
        message: `briefOverviewProse mentions "${c.label}" but no module includes the corresponding sub-modules / parts.`,
        suggested_fix: c.fix,
      })
    }
  }

  // ── 4. £180,000 cost target reflected in unit-cost claim consistency check
  // (Already covered by check 1; no second check needed)

  return v
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
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 300)}`)
}

async function repair(modules: Module[], violations: Violation[], brief: string): Promise<Module[]> {
  const systemPrompt = `You are a senior systems engineer fixing brief-vs-module drifts in a hardware product decomposition. Each violation is a place where briefOverviewProse states something that the module data doesn't reflect, OR where the design has drifted from a brief-stated number.

EDIT POLICY:
- Apply each violation's suggested_fix unless the suggestion is wrong, in which case make a better targeted fix that resolves the underlying drift.
- For dc_bus_voltage_drift_from_brief: adjust the cell-string topology to hit the brief value exactly. Propagate the new voltage to EVERY module that carries dc_bus_voltage_v / dc_input_voltage_v / nominal_voltage_v. Recompute pack current = peak_power_w / new_voltage_v and update bus ratings to >= 1.10 × required.
- For cost_ceiling_not_in_data: add the cost ceiling as a derived_parameter on the appropriate module (maintenance_serviceability is a reasonable home).
- For prose_claims_not_in_modules: add the missing sub-module(s) with realistic parts. Use the EXISTING sub-module schema (id, name_human, words[], english_sentence, rad_syntax, role_verb, topology_clause).
- DO NOT add or remove modules. Stay at the same module count.
- Update overview_paragraph_en in every module you change so the prose tracks the data.
- Preserve everything not touched by a violation.

Return the FULL corrected modules array as { "modules": [...] }. Output ONLY JSON.`

  const userContent = `BRIEF:
${brief}

MODULES (current state):
${JSON.stringify({ modules }, null, 2)}

VIOLATIONS TO FIX:
${violations.map(v => `[${v.severity.toUpperCase()} / ${v.kind}] ${v.message}\n  → ${v.suggested_fix}`).join('\n\n')}

Return the corrected JSON.`

  console.error(`[brief-prose-validate] calling Grok 4.3 with ${violations.length} violations...`)
  const t0 = Date.now()
  const raw = await callGrok(systemPrompt, userContent)
  console.error(`[brief-prose-validate] Grok responded in ${Date.now() - t0}ms (${raw.length} chars)`)
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
    console.error('Usage: brief-prose-validate-repair.tsx <state.json> <brief.md> <out-dir>')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const briefPath = resolve(args[1])
  const outDir = resolve(args[2])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const brief = readFileSync(briefPath, 'utf-8')
  const modules: Module[] = state.moduleDecomposition?.modules ?? []
  console.error(`[brief-prose-validate] modules: ${modules.length}`)

  const before = validateBriefProseVsModules(state, brief)
  console.error(`\n=== VIOLATIONS BEFORE ===`)
  for (const v of before) {
    console.error(`[${v.severity.toUpperCase()} / ${v.kind}] ${v.message}`)
    console.error(`  → ${v.suggested_fix}`)
  }
  console.error(`Total: ${before.length}`)
  writeFileSync(resolve(outDir, 'violations-before.json'), JSON.stringify(before, null, 2))

  let finalModules = modules
  if (before.length > 0) {
    finalModules = await repair(modules, before, brief)
    writeFileSync(resolve(outDir, 'modules-after-repair.json'), JSON.stringify({ modules: finalModules }, null, 2))

    // Re-validate
    const afterState = { ...state, moduleDecomposition: { ...state.moduleDecomposition, modules: finalModules } }
    const after = validateBriefProseVsModules(afterState, brief)
    console.error(`\n=== VIOLATIONS AFTER ===`)
    for (const v of after) {
      console.error(`[${v.severity.toUpperCase()} / ${v.kind}] ${v.message}`)
    }
    console.error(`Total: ${after.length}, Δ resolved: ${before.length - after.length}`)
    writeFileSync(resolve(outDir, 'violations-after.json'), JSON.stringify(after, null, 2))
  } else {
    console.error('\n[brief-prose-validate] no violations — brief and modules already aligned.')
  }

  // Rebuild naturalLanguageLayer, save, render
  const correctedState = {
    ...state,
    moduleDecomposition: {
      ...state.moduleDecomposition,
      modules: finalModules,
    },
    savedAt: new Date().toISOString(),
  }
  try {
    const { buildNaturalLanguageLayer } = await import('../src/lib/pdf-engine-v2/radical/sentence-generator')
    correctedState.naturalLanguageLayer = buildNaturalLanguageLayer(finalModules as any)
    for (const m of finalModules as any[]) {
      const nl = correctedState.naturalLanguageLayer.by_module[m.module]
      if (nl && m.overview_paragraph_en) (nl as any).paragraph_en_llm = m.overview_paragraph_en
    }
  } catch {}

  const finalStatePath = resolve(outDir, 'state-brief-aligned.json')
  writeFileSync(finalStatePath, JSON.stringify(correctedState, null, 2))

  const pdfPath = resolve(outDir, 'brief-aligned.pdf')
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), finalStatePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  execFileSync('open', [pdfPath])
  console.error(`[brief-prose-validate] opened ${pdfPath}`)
}

main().catch(err => {
  console.error('[brief-prose-validate] FATAL:', err)
  process.exit(1)
})
