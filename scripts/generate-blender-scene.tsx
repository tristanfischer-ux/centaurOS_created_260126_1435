#!/usr/bin/env npx tsx
/**
 * scripts/generate-blender-scene.tsx
 *
 * Phase 3 — per-project hand-coded Blender geometry generator
 * (mempalace drawer_forgeos_decisions_3f18c3cae92fe29e).
 *
 * Reads state.json + the matching per-class template (scripts/blender-
 * templates/<class>-9shot.py) + forge_blender_lib.py reference, then calls
 * an LLM via OpenRouter to emit a brief-specific blender-scene.py in
 * <out-dir>/. The render runner (scripts/render-blender-scene.py) picks
 * up the generated script if present, falls back to the unmodified
 * template otherwise.
 *
 * Model selection (BLENDER_GEN_MODEL env override):
 *   default: openai/gpt-5.5    — best visual density, $0.36 / 137 s
 *   cheap:   anthropic/claude-sonnet-4.6 — good quality, $0.21 / 125 s
 *   premium: anthropic/claude-opus-4.7   — marginal improvement, $1.30 / 126 s
 *   fast:    x-ai/grok-4.3              — 6× faster, slightly desaturated, $0.14 / 22 s
 *
 * Bake-off results (BESS L12, 2026-05-24): see /tmp/bess-l12-validate/
 * showcase.html "Phase 3 bake-off" section.
 *
 * Quality gate: syntax-checks the generated Python before writing. If
 * the model output fails ast.parse, retries ONCE with the parser error
 * fed back. If still failing, exits non-zero so the runner falls back
 * to the unmodified template.
 *
 * Usage:
 *   npx tsx scripts/generate-blender-scene.tsx <state.json> [--write]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { execFileSync } from 'child_process'

const DEFAULT_MODEL = process.env.BLENDER_GEN_MODEL || 'openai/gpt-5.5'
const TEMPLATES_DIR = resolve(__dirname, 'blender-templates')

// product_class substring → template filename. Same mapping as
// scripts/render-blender-scene.py CLASS_TO_TEMPLATE.
const CLASS_TO_TEMPLATE: Array<[string, string]> = [
  ['energy_storage', 'bess-9shot.py'],
  ['battery_energy_storage', 'bess-9shot.py'],
  ['bess', 'bess-9shot.py'],
  ['bioreactor', 'bioreactor-9shot.py'],
  ['drone', 'drone-9shot.py'],
  ['consumer_cinematography_drone', 'drone-9shot.py'],
  ['auv', 'auv-9shot.py'],
  ['autonomous_underwater', 'auv-9shot.py'],
  ['cgm', 'cgm-9shot.py'],
  ['wearable_medical_device', 'cgm-9shot.py'],
  ['edge_ai', 'edge-ai-9shot.py'],
  ['edge-ai', 'edge-ai-9shot.py'],
  ['ev_charger', 'ev-charger-9shot.py'],
  ['ev-charger', 'ev-charger-9shot.py'],
  ['dc_fast_ev_charger', 'ev-charger-9shot.py'],
]

function resolveTemplate(productClass: string): string | null {
  const pc = productClass.toLowerCase()
  for (const [key, fname] of CLASS_TO_TEMPLATE) {
    if (pc.includes(key)) {
      const path = resolve(TEMPLATES_DIR, fname)
      if (existsSync(path)) return path
    }
  }
  return null
}

function parseInt0(s: string): number {
  const m = s.match(/\d+/)
  return m ? parseInt(m[0], 10) : 0
}

function parseDimsMm(s: string): [number, number, number] | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)/)
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null
}

function buildDigest(state: any): string {
  const md = state?.moduleDecomposition || {}
  const env = state?.parsedBrief?.constraints?.max_dimensions_mm || {}
  const modules: any[] = md.modules || []
  const lines: string[] = []
  lines.push(`Product class: ${md.product_class}`)
  lines.push(`Envelope: ${env.w}×${env.d}×${env.h} mm (${(env.w/1000).toFixed(2)}×${(env.d/1000).toFixed(2)}×${(env.h/1000).toFixed(2)} m)`)
  lines.push(`Module count: ${modules.length}`)
  lines.push('', '=== MODULES ===')
  for (let mi = 0; mi < modules.length; mi++) {
    const m = modules[mi]
    const dp = m?.derived_parameters || {}
    const dpStr = Object.entries(dp).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(', ')
    lines.push(`\n[Module ${mi + 1}] id=${JSON.stringify(m.module)}`)
    if (dpStr) lines.push(`  derived_parameters: ${dpStr}`)
    const sms: any[] = m.sub_modules || []
    for (let si = 0; si < sms.length; si++) {
      const sm = sms[si]
      lines.push(`  Sub-module ${mi + 1}.${si + 1}: id=${JSON.stringify(sm.id)} name=${JSON.stringify(sm.name_human || '')}`)
      if (sm.topology_clause) lines.push(`    topology: ${sm.topology_clause}`)
      const words: any[] = sm.words || []
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi]
        const cid = (w?.content_character?.character_id) || ''
        let qty = 1
        let dims: string | null = null
        for (const mod of w?.modifier_characters || []) {
          if (mod?.kind === 'quantity') qty = parseInt0(String(mod.value || '')) || 1
          if (mod?.kind === 'dimensions') dims = String(mod.value || '')
        }
        const dimStr = dims ? ` [${dims}]` : ''
        lines.push(`    ${wi + 1}. ×${qty} ${JSON.stringify(w.name_human || '')} (id=${cid})${dimStr}`)
      }
    }
  }
  return lines.join('\n')
}

function buildPrompt(state: any, lib: string, template: string): string {
  const env = state?.parsedBrief?.constraints?.max_dimensions_mm || {}
  const W = (env.w || 12000) / 1000
  const D = (env.d || 2400) / 1000
  const H = (env.h || 2900) / 1000
  const digest = buildDigest(state)
  return `You are generating a Blender Python script for a ForgeOS engineering report. Output is ONE Python file — no preamble, no markdown fences, no explanation. The script will be invoked as:

  /Applications/Blender.app/Contents/MacOS/Blender --background --python <your-output>.py

It must produce 1 hero image + N per-module images using the forge_blender_lib helpers.

## API: forge_blender_lib.py (READ CAREFULLY — use these helpers, do not reinvent)

\`\`\`python
${lib}
\`\`\`

## Reference template for the same product class

This is the existing hand-coded template. STUDY IT for the pattern (module structure, helper usage, geometry approach). Your output should follow the same pattern but for the specific brief below — same imports, same OUT/MO/MAT pattern, same fl.run_render_pipeline ending.

\`\`\`python
${template}
\`\`\`

## The specific brief (digest of state.json)

\`\`\`
${digest}
\`\`\`

## Strict requirements

1. Output ONLY Python. NO markdown fences. NO explanation. First character must be \`"""\` (a docstring) or \`import\`.
2. Start exactly like the template: docstring, then \`import bpy / import os / import math / import sys / from pathlib import Path / sys.path.insert(0, ...) / import forge_blender_lib as fl\`.
3. After \`fl.init_scene()\`, set \`POC_DIR = Path(__file__).parent\` and \`OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-generated")))\`.
4. Use envelope constants W, D, H from the brief's envelope (METRES, divide mm by 1000): \`W = ${W}\`, \`D = ${D}\`, \`H = ${H}\`.
5. Create MO dict with ALL module IDs listed in the brief.
6. Create MAT via \`fl.make_default_palette()\`, then ADD any class-specific colours you reference (e.g. \`MAT["chiller"] = fl.make_mat(...)\`). Never reference an undefined key.
7. For EVERY sub-module in the brief, emit appropriate geometry using fl.add_box / fl.add_cyl / fl.add_torus / fl.add_sphere. Use REAL dimensions from the [dim] strings (convert mm → m by dividing by 1000). Multiplied components (e.g. ×3750 LFP cells) should pack into a reasonable grid (not 3750 individual cubes — instead a few representative rack arrays).
8. Position sub-modules SEMANTICALLY according to the topology clause and physical reality of the product class. Use your engineering knowledge.
9. Every object must be assigned to its module via the \`module=\` and \`module_objects=MO\` kwargs so the per-module render pass works.
10. End with these three lines (in order):
    \`fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)\`
    \`fl.make_world_white()\`
    \`fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")\`
11. Target length: 250–400 lines. Keep it concrete — explicit fl.add_box calls beat clever loops.
12. Primitive budget: TARGET 80, MAX 120 fl.add_* calls total across all modules. Each primitive adds ~3 s to total render time (Freestyle outline cost). Group small components into representative arrays rather than instantiating each one. For ×N quantities, draw 1-4 representative items, not N.

Generate the complete Python file now.`
}

function loadOpenRouterKey(): string | undefined {
  for (const p of [
    `${process.env.HOME}/.claude/secrets/openrouter.env`,
    `${process.env.HOME}/secrets/openrouter.env`,
  ]) {
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf-8')
    const m = txt.match(/OPENROUTER_API_KEY\s*=\s*['"]?([^'"\s]+)['"]?/)
    if (m) return m[1]
  }
  return process.env.OPENROUTER_API_KEY
}

async function callModel(prompt: string, model: string, extraSystem?: string): Promise<string | null> {
  const key = loadOpenRouterKey()
  if (!key) {
    console.error('[geom-gen] OPENROUTER_API_KEY missing')
    return null
  }
  const messages: any[] = []
  if (extraSystem) messages.push({ role: 'system', content: extraSystem })
  messages.push({ role: 'user', content: prompt })
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://fractionalforge.com',
      'X-Title': 'ForgeOS blender geometry generator',
    },
    body: JSON.stringify({ model, messages, max_tokens: 16384, temperature: 0.3 }),
  })
  if (!res.ok) {
    console.error(`[geom-gen] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return null
  }
  const j: any = await res.json()
  if (j?.error) {
    console.error(`[geom-gen] API error: ${JSON.stringify(j.error).slice(0, 300)}`)
    return null
  }
  let text: string = j?.choices?.[0]?.message?.content || ''
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n')
    if (text.trimEnd().endsWith('```')) text = text.trimEnd().slice(0, -3).trimEnd()
  }
  return text
}

function pythonSyntaxCheck(py: string): { ok: boolean; error?: string } {
  try {
    execFileSync('python3', ['-c', `import ast,sys; ast.parse(sys.stdin.read())`], {
      input: py,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true }
  } catch (err: any) {
    const msg = String(err?.stderr || err?.message || '').slice(0, 500)
    return { ok: false, error: msg }
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: generate-blender-scene.tsx <state.json> [--write]')
    return 1
  }
  const statePath = resolve(args[0])
  if (!existsSync(statePath)) {
    console.error(`State not found: ${statePath}`)
    return 1
  }
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const productClass = String(state?.moduleDecomposition?.product_class || state?.parsedBrief?.product_class || '')
  if (!productClass) {
    console.error('[geom-gen] state has no product_class')
    return 5
  }
  const templatePath = resolveTemplate(productClass)
  if (!templatePath) {
    console.error(`[geom-gen] no template for product_class=${JSON.stringify(productClass)}; runner will use universal renderer`)
    return 5
  }

  const libPath = resolve(TEMPLATES_DIR, 'forge_blender_lib.py')
  const lib = readFileSync(libPath, 'utf-8')
  const template = readFileSync(templatePath, 'utf-8')
  const prompt = buildPrompt(state, lib, template)

  console.log(`[geom-gen] product_class=${productClass} template=${templatePath.split('/').pop()} model=${DEFAULT_MODEL}`)
  const t0 = Date.now()
  let py = await callModel(prompt, DEFAULT_MODEL)
  if (!py) {
    console.error('[geom-gen] first model call failed')
    return 6
  }
  console.log(`[geom-gen] first attempt: ${py.split('\n').length} lines, ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  let check = pythonSyntaxCheck(py)
  if (!check.ok) {
    console.error(`[geom-gen] syntax check failed, retrying once with error feedback...`)
    const retryPrompt = prompt + `\n\nThe previous attempt failed with this Python syntax error:\n\n${check.error}\n\nProduce a fully-valid Python file this time. Output only the Python.`
    const py2 = await callModel(retryPrompt, DEFAULT_MODEL)
    if (py2) {
      const check2 = pythonSyntaxCheck(py2)
      if (check2.ok) {
        py = py2
        check = check2
        console.log(`[geom-gen] retry succeeded: ${py.split('\n').length} lines`)
      }
    }
  }
  if (!check.ok) {
    console.error(`[geom-gen] retry also failed: ${check.error}`)
    return 6
  }

  const outDir = dirname(statePath)
  const outPath = resolve(outDir, 'blender-scene.py')
  if (args.includes('--write')) {
    writeFileSync(outPath, py)
    // Also copy forge_blender_lib.py into the out-dir so the script can
    // import it via the sys.path.insert(0, str(Path(__file__).parent)) pattern.
    const libDest = resolve(outDir, 'forge_blender_lib.py')
    writeFileSync(libDest, lib)
    console.log(`[geom-gen] wrote ${outPath} (${py.length} bytes) + forge_blender_lib.py`)
  } else {
    console.log(`[geom-gen] dry run — pass --write to persist`)
  }
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[geom-gen] FATAL: ${err}`)
    process.exit(1)
  })
