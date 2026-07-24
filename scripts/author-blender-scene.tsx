#!/usr/bin/env npx tsx
/**
 * scripts/author-blender-scene.tsx
 *
 * B2 + B3 (ANVIL-UNIVERSAL-LOOP-PLAN.md WS-B) — on-the-fly Blender scene
 * AUTHOR + deterministic VERIFY-REVISE loop for UNSEEN product classes
 * (registry-miss path ONLY — hand templates in CLASS_TO_TEMPLATE stay the
 * fast path, served by scripts/generate-blender-scene.tsx).
 *
 * Pipeline per run:
 *   1. Build a DESIGN DIGEST from state.json (envelope, modules +
 *      derived_parameters, sub-module words + dims, cross-module grammar
 *      links, key orchestratorContract quantities, brief excerpt).
 *   2. Prompt an LLM (OpenRouter) with the digest + the versioned
 *      PRIMITIVE-API.md (generated from forge_blender_lib.py docstrings by
 *      gen_primitive_api_doc.py). The model must emit a standalone
 *      blender-scene.py composed ONLY of the B1 parametric primitives +
 *      placement relations + run_render_pipeline, every dimension traced to
 *      a digest field via a trailing `# <- digest:` comment.
 *   3. Validate statically: AST parse + allowlist walk + kwarg schema
 *      type-check (validate_authored_scene.py + primitive-api-schema.json).
 *   4. Verify deterministically: headless Blender executes the scene with
 *      rendering stubbed (run_authored_scene_checks.py, mode=check) and runs
 *      forge_scene_checks.run_all_checks — module-tag count, envelope ±5%,
 *      interpenetration, connectivity, clearance zones, CoM (G2: ONLY these
 *      deterministic checks decide; no vision judge is wired this increment
 *      — its findings would be advisory-only per G2 anyway).
 *   5. On failure: feed the JSON findings back to the LLM. <= 4 iterations.
 *   6. On convergence: full render (mode=render → 3 spatial + hero +
 *      per-module PNGs), save blender-scene.py + checks-report.json to the
 *      out-dir, and record a CANDIDATE row in ~/.forge-truth/forge-truth.db
 *      table authored_scene_candidates per G1 (status 'candidate' — NEVER
 *      auto-promoted; promotion to shadow/approved is a separate, gated
 *      step).
 *   7. On non-convergence (G3): write author-failure.json (structured,
 *      honest), emit NO scene, exit 5 — the chain falls back to its
 *      existing behaviour and the render-quality gate flags it.
 *
 * CHAIN INTEGRATION (deferred — serial-design-chain-v2.tsx is dirty in
 * another workstream): the chain should call
 * authorBlenderSceneForRegistryMiss(statePath, outDir) when
 * generate-blender-scene.tsx exits 5 (no template). See
 * ANVIL-UNIVERSAL-TRACKER.md item 10.
 *
 * Usage:
 *   npx tsx scripts/author-blender-scene.tsx <state.json> [--out <dir>]
 *
 * Env:
 *   BLENDER_AUTHOR_MODEL     (default openai/gpt-5.6-sol — same as geom-gen; 2026-07-24 refresh)
 *   BLENDER_AUTHOR_FALLBACK  (default google/gemini-3.5-flash; the pipeline
 *                             is Anthropic-free — do not add Claude models)
 *   BLENDER_BIN              (default /Applications/Blender.app/.../Blender)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, dirname, basename, isAbsolute } from 'path'
import { spawnSync } from 'child_process'
import Database from 'better-sqlite3'

const TEMPLATES_DIR = resolve(__dirname, 'blender-templates')
const BLENDER = process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender'
const AUTHOR_MODEL = process.env.BLENDER_AUTHOR_MODEL || 'openai/gpt-5.6-sol'
const AUTHOR_FALLBACK = process.env.BLENDER_AUTHOR_FALLBACK || 'google/gemini-3.5-flash'
const MAX_ITERATIONS = 4 // G3: hard cap, then honest fallback
const MAX_LLM_CALLS = 6  // cost guard (iterations + fallback retries)
const FORGE_TRUTH_DB = `${process.env.HOME}/.forge-truth/forge-truth.db`

// ─── Design digest (B2 input) ────────────────────────────────────────────

export interface AuthorDigest {
  text: string
  classSlug: string
  moduleIds: string[]
  envelopeMm: [number, number, number]
  masses: Record<string, number>
  structureModuleId: string
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function parseQty(s: string): number {
  const m = String(s).match(/\d+/)
  return m ? parseInt(m[0], 10) : 1
}

export function buildAuthorDigest(state: any): AuthorDigest {
  const md = state?.moduleDecomposition || {}
  const pb = state?.parsedBrief || {}
  const env = pb?.constraints?.max_dimensions_mm || {}
  const modules: any[] = md.modules || []
  const productClass = String(md.product_class || pb.product_class || 'unknown_class')
  const classSlug = slugify(productClass)
  const envelopeMm: [number, number, number] = [
    Number(env.w) || 0, Number(env.d) || 0, Number(env.h) || 0,
  ]
  const moduleIds = modules.map((m) => String(m.module))
  const masses: Record<string, number> = {}
  const lines: string[] = []

  lines.push(`product_class: ${productClass}`)
  if (md.productClassDescription) lines.push(`class_description: ${String(md.productClassDescription).slice(0, 240)}`)
  lines.push(`envelope_mm (max_dimensions, w×d×h): ${envelopeMm[0]} × ${envelopeMm[1]} × ${envelopeMm[2]}`)
  const brief = [pb.mission_statement, pb.product_description].filter(Boolean).join(' — ')
  if (brief) lines.push(`brief_excerpt: ${brief.slice(0, 700)}`)
  lines.push(`module_count: ${modules.length}`)

  lines.push('', '=== MODULES (decomposition — EVERY module id must own >=1 primitive) ===')
  for (const m of modules) {
    const id = String(m.module)
    lines.push(`\n[module ${id}]`)
    if (m.module_brief) lines.push(`  brief: ${String(m.module_brief).slice(0, 220)}`)
    const dp = m?.derived_parameters || {}
    const dpEntries = Object.entries(dp).slice(0, 16)
    if (dpEntries.length) {
      lines.push(`  derived_parameters: ${dpEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`)
    }
    if (typeof dp.mass_kg === 'number' && isFinite(dp.mass_kg)) masses[id] = dp.mass_kg
    for (const sm of m.sub_modules || []) {
      lines.push(`  sub_module ${sm.id}: ${sm.name_human || ''}`)
      if (sm.topology_clause) lines.push(`    topology: ${String(sm.topology_clause).slice(0, 180)}`)
      for (const w of sm.words || []) {
        let qty = 1
        let dims: string | null = null
        for (const mod of w?.modifier_characters || []) {
          if (mod?.kind === 'quantity') qty = parseQty(mod.value)
          if (mod?.kind === 'dimensions') dims = String(mod.value || '')
        }
        lines.push(`    - x${qty} ${w.name_human || w.id}${dims ? ` [${dims}]` : ''}`)
      }
    }
  }

  const links: any[] = md.cross_module_grammar_links || []
  if (links.length) {
    lines.push('', '=== GRAMMAR LINKS (connectivity — route + relate accordingly) ===')
    for (const l of links) {
      lines.push(`  ${l.from_module} -> ${l.to_module} (${l.mechanism}): ${String(l.detail || '').slice(0, 140)}`)
    }
  }

  const q = state?.orchestratorContract?.quantities || {}
  const qEntries = Object.entries(q) as Array<[string, any]>
  const geomFamilies = new Set(['length', 'area', 'mass', 'count', 'volume', 'power'])
  const picked = qEntries
    .filter(([, v]) => v && (geomFamilies.has(String(v.family)) || String(v.source) === 'brief'))
    .slice(0, 30)
  if (picked.length) {
    lines.push('', '=== KEY CONTRACT QUANTITIES ===')
    for (const [k, v] of picked) {
      lines.push(`  ${k} = ${v.value} ${v.unit || ''} (source=${v.source || '?'})`)
    }
  }

  // Structure anchor guess: a module whose id smells structural, else first.
  const structureModuleId =
    moduleIds.find((id) => /structure|containment|enclosure|frame|chassis|hull|nacelle|foundation/.test(id)) ||
    moduleIds[0] || 'structure_containment'

  return { text: lines.join('\n'), classSlug, moduleIds, envelopeMm, masses, structureModuleId }
}

// ─── Deterministic check spec (B3 — built from the digest, never the LLM) ──

export function buildCheckSpec(d: AuthorDigest): any {
  const spec: any = {
    expected_modules: d.moduleIds,
    envelope_mm: d.envelopeMm,
    envelope_tol: 0.05,
    interpenetration_tolerance_mm: 5,
    clearance_tolerance_mm: 1,
  }
  // CoM-within-support-polygon is only meaningful for the GROUND-STANDING
  // part of a scene. For tethered / flying platforms (tidal kite, HAPS,
  // moored buoys) the platform's CoM legitimately sits outside the anchor
  // footprint — that is what the anchor mass/tether resists — so the check
  // scopes to the anchored/foundation modules (gravity-base stability),
  // class-agnostically via module-id pattern. Ground-standing classes get
  // the full-scene CoM check.
  const FLYING = /tether|mooring|wing|aero|flight|buoyan|airframe/
  const ANCHOR = /foundation|anchor|seabed|gravity_base|ground_station/
  const isTethered = d.moduleIds.some((id) => FLYING.test(id))
  const anchorIds = d.moduleIds.filter((id) => ANCHOR.test(id))
  let masses = d.masses
  let scope: string[] | undefined
  if (isTethered && anchorIds.length > 0) {
    scope = anchorIds
    masses = Object.fromEntries(
      Object.entries(d.masses).filter(([k]) => anchorIds.includes(k)))
  }
  if (Object.keys(masses).length >= 1) {
    spec.com = [{ masses, ...(scope ? { scope } : {}), ground_tol_mm: 150 }]
  }
  return spec
}

// ─── Prompt ────────────────────────────────────────────────────────────────

function buildAuthorPrompt(d: AuthorDigest, apiDoc: string): string {
  const [W, D, H] = d.envelopeMm
  return `You are authoring a Blender Python scene script for a ForgeOS engineering dossier — a STRUCTURALLY FAITHFUL schematic of an engineering design the renderer has never seen before. Output is ONE standalone Python file — no preamble, no markdown fences, no explanation. It will run as:

  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender-scene.py

## THE ONLY API YOU MAY USE

${apiDoc}

## THE DESIGN DIGEST (single source of truth for every dimension)

\`\`\`
${d.text}
\`\`\`

## STRICT GRAMMAR (a static validator + deterministic geometry checks REJECT violations)

1. Output ONLY Python. First character must be \`"""\` (docstring) or \`import\`.
2. Exact preamble (nothing else may be imported):
   import os
   import sys
   import math
   from pathlib import Path
   sys.path.insert(0, str(Path(__file__).parent))
   import forge_blender_lib as fl
   NO \`import bpy\`. NO other imports. NO raw mesh ops. ONLY \`fl.\` calls from the API above (legacy fl.add_box/add_cyl are NOT in the API — compose parametric prim_* primitives).
3. Then: fl.init_scene(); OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(Path(__file__).parent / "out-authored"))); MO = fl.make_module_dict([...ALL ${d.moduleIds.length} module ids from the digest...]); MAT = fl.make_default_palette(); define any extra colours with fl.make_mat (saturated accents — fl.get_module_profile(module_id) gives the canonical accent_rgb).
4. EVERY primitive call passes module=<module_id> and module_objects=MO. EVERY module id must own >=1 primitive (deterministic check: module_tag_count).
5. NAME the PRIMARY assembly of each module EXACTLY the module id (e.g. fl.prim_wing("${d.moduleIds[0] || 'hydrofoil_wing'}", ...)). Secondary assemblies in the same module: "<module_id>_2" etc. The CoM check keys masses by these names.
6. Declare fl.declare_structure_root(<main anchor assembly>) and CONNECT every assembly to it through relations: parent=/fuselage=/connect=() kwargs or fl.declare_relation(a, "supports"|"contains"|"attached_to", b). The connectivity check FAILS anything floating; the interpenetration check FAILS overlapping assemblies that have NO declared relation (declared relations exempt intentional joins).
7. ENVELOPE: the whole-scene bounding box must fit ${W} × ${D} × ${H} mm (w×d×h) within +5%, and should FILL it (under-fill beyond -5% is flagged). Lay the scene out in mm against these bounds.
8. EVERY dimension number must trace to a digest field: end each prim_* call line (or its closing line) with a trailing comment \`# <- digest: <field path>\` e.g. \`# <- digest: modules[hydrofoil_wing].derived_parameters.wing_span_m\`. >=80% of prim_* calls must carry one — the validator counts.
9. Place modules SEMANTICALLY per the topology clauses, grammar links and the physics of the product class. Route physical connections (pipes/cables/tethers/ducts) with fl.prim_pipe_run — pass connect=(asm_a, asm_b) so the link is declared. fl.route_orthogonal gives Manhattan waypoints; pass explicit 2-point waypoints for straight runs (e.g. a taut tether).
10. Assembly extras (centre_m, size_m, top_z_m, ports_m, radius_m) are METRES — multiply by 1000 when feeding back into mm params.
11. End with EXACTLY these three calls (cameras are handled inside run_render_pipeline — create none yourself):
    fl.add_lights(target_centre=(<scene centre, metres>), fill_energy=260, fill_size=<~scene max dim in m>)
    fl.make_world_white()
    fl.run_render_pipeline(OUT, MO, structure_module_id="${d.structureModuleId}")
12. Target 120-260 lines. Explicit calls beat clever loops. No try/except.

Generate the complete Python file now.`
}

// ─── OpenRouter plumbing (same pattern as generate-blender-scene.tsx) ─────

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

let llmCalls = 0
let llmTokens = { prompt: 0, completion: 0 }

async function callModel(messages: any[], model: string): Promise<string | null> {
  if (llmCalls >= MAX_LLM_CALLS) {
    console.error(`[author] LLM call budget exhausted (${MAX_LLM_CALLS})`)
    return null
  }
  const key = loadOpenRouterKey()
  if (!key) {
    console.error('[author] OPENROUTER_API_KEY missing')
    return null
  }
  llmCalls += 1
  let res: Response
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS blender scene author (registry-miss)',
      },
      body: JSON.stringify({ model, messages, max_tokens: 16384, temperature: 0.25 }),
      // Hard timeout — an un-aborted hang here stalls the whole loop (the
      // Blender steps are spawnSync with timeouts; this was the only
      // unbounded wait).
      signal: AbortSignal.timeout(240_000),
    })
  } catch (err: any) {
    console.error(`[author] fetch failed/timed out: ${String(err?.message || err).slice(0, 200)}`)
    return null
  }
  if (!res.ok) {
    console.error(`[author] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return null
  }
  const j: any = await res.json()
  if (j?.error) {
    console.error(`[author] API error: ${JSON.stringify(j.error).slice(0, 300)}`)
    return null
  }
  llmTokens.prompt += j?.usage?.prompt_tokens || 0
  llmTokens.completion += j?.usage?.completion_tokens || 0
  let text: string = j?.choices?.[0]?.message?.content || ''
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n')
    if (text.trimEnd().endsWith('```')) text = text.trimEnd().slice(0, -3).trimEnd()
  }
  return text
}

// ─── Revision feedback (shared by the live loop AND --resume replay) ──────

function staticFeedback(violations: any[]): string {
  return `Your script FAILED static validation against the primitive API. Violations (line / rule / detail):\n\n${JSON.stringify(violations, null, 2)}\n\nFix EVERY violation and re-emit the COMPLETE corrected Python file. Same grammar rules apply. Output only Python.`
}

function checksFeedback(fails: any[], envelopeMm: [number, number, number]): string {
  return `Your scene built but FAILED these deterministic geometry checks (run inside Blender against the design digest):\n\n${JSON.stringify(fails, null, 2)}\n\nDiagnose each failure and re-emit the COMPLETE corrected Python file (full file, not a diff). Reminders: envelope is ${envelopeMm.join(' x ')} mm +/-5%; every module id needs >=1 tagged primitive; unrelated assemblies must not overlap >5 mm (declare a relation for intentional joins); everything must reach the structure root via relations. Output only Python.`
}

/**
 * --resume crash recovery: replay completed-but-FAILED iterations already on
 * disk (author-iter-N.py + its validate/checks verdict) into the message
 * history so a restarted process continues from iter N+1 instead of burning
 * the G3 cap re-doing iter 1. Replays stop at the first iteration without a
 * complete failed verdict (incomplete = the crash point; converged = nothing
 * to resume). Returns the number of iterations replayed.
 */
function replayPriorIterations(outDir: string, envelopeMm: [number, number, number],
                               messages: any[]): number {
  let replayed = 0
  for (let n = 1; n <= MAX_ITERATIONS; n++) {
    const scenePath = resolve(outDir, `author-iter-${n}.py`)
    if (!existsSync(scenePath)) break
    let feedback: string | null = null
    const vPath = resolve(outDir, `author-iter-${n}-validate.json`)
    const cPath = resolve(outDir, `author-iter-${n}-checks.json`)
    try {
      if (existsSync(vPath)) {
        const v = JSON.parse(readFileSync(vPath, 'utf-8'))
        if (v.ok !== true) {
          feedback = staticFeedback(v.violations || [])
        } else if (existsSync(cPath)) {
          const c = JSON.parse(readFileSync(cPath, 'utf-8'))
          if (c.ok !== true) {
            feedback = checksFeedback(
              (c.findings || []).filter((f: any) => f.status === 'fail'), envelopeMm)
          }
        }
      }
    } catch { break }
    if (!feedback) break
    messages.push({ role: 'assistant', content: readFileSync(scenePath, 'utf-8') })
    messages.push({ role: 'user', content: feedback })
    replayed = n
    console.log(`[author] resume: replayed failed iter ${n} from ${outDir}`)
  }
  return replayed
}

// ─── Validation + verification steps ──────────────────────────────────────

function staticValidate(scenePath: string): { ok: boolean; report: any } {
  const r = spawnSync('python3', [
    resolve(TEMPLATES_DIR, 'validate_authored_scene.py'),
    scenePath,
    resolve(TEMPLATES_DIR, 'primitive-api-schema.json'),
  ], { encoding: 'utf-8', timeout: 30_000 })
  let report: any = { ok: false, violations: [{ line: 0, rule: 'validator', detail: (r.stderr || 'validator crashed').slice(0, 400) }] }
  try { report = JSON.parse(r.stdout) } catch { /* keep crash report */ }
  return { ok: r.status === 0 && report.ok === true, report }
}

function blenderVerify(scenePath: string, specPath: string, reportPath: string,
                       mode: 'check' | 'render', outDir: string):
    { ok: boolean; report: any; raw: string } {
  const r = spawnSync(BLENDER, [
    '--background', '--python',
    resolve(TEMPLATES_DIR, 'run_authored_scene_checks.py'),
    '--', scenePath, specPath, reportPath, mode,
  ], {
    encoding: 'utf-8',
    timeout: mode === 'check' ? 300_000 : 1_200_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, BLENDER_OUT_DIR: outDir },
  })
  let report: any = null
  if (existsSync(reportPath)) {
    try { report = JSON.parse(readFileSync(reportPath, 'utf-8')) } catch { /* below */ }
  }
  if (!report) {
    report = {
      ok: false,
      findings: [{ check: 'blender_runs', status: 'fail',
                   detail: `blender exited ${r.status}: ${(r.stderr || r.stdout || '').slice(-600)}` }],
    }
  }
  return { ok: r.status === 0 && report.ok === true, report, raw: (r.stdout || '') + (r.stderr || '') }
}

// ─── G1 candidate store ────────────────────────────────────────────────────

// classSlug is LLM/brief-derived (slugify of product_class) → treat as
// UNTRUSTED at this boundary. slugify() upstream already restricts the
// alphabet, but recordCandidate is exported and must defend itself
// (security item 18: the old sqlite3-CLI string-interpolated INSERT was an
// injection surface into ~/.forge-truth/forge-truth.db).
const CLASS_SLUG_RE = /^[a-z0-9_]{1,64}$/
const API_VERSION_RE = /^\d+\.\d+\.\d+$/

export function assertCandidateStoreInputs(classSlug: string, apiVersion: string,
                                           scenePath: string, reportPath: string): void {
  const reject = (field: string, value: unknown, rule: string): never => {
    throw new Error(`[author] candidate-store input rejected: ` + JSON.stringify({
      error: 'candidate_store_input_rejected',
      field, rule, value: String(value).slice(0, 120),
    }))
  }
  if (typeof classSlug !== 'string' || !CLASS_SLUG_RE.test(classSlug)) {
    reject('classSlug', classSlug, 'must match /^[a-z0-9_]{1,64}$/')
  }
  if (typeof apiVersion !== 'string' || !API_VERSION_RE.test(apiVersion)) {
    reject('apiVersion', apiVersion, 'must match /^\\d+\\.\\d+\\.\\d+$/')
  }
  for (const [field, p] of [['scenePath', scenePath], ['reportPath', reportPath]] as const) {
    if (typeof p !== 'string' || !isAbsolute(p)) reject(field, p, 'must be an absolute path constructed by this script')
    if (p.includes("'")) reject(field, p, 'must not contain single quotes')
  }
}

export function recordCandidate(classSlug: string, scenePath: string, reportPath: string,
                                apiVersion: string, outDir: string): string {
  // Validate BEFORE any use (throws a structured error on bad input).
  assertCandidateStoreInputs(classSlug, apiVersion, scenePath, reportPath)
  const script = readFileSync(scenePath, 'utf-8')
  const checksJson = readFileSync(reportPath, 'utf-8')
  // Debug artefact (replaces the old candidate-insert.sql, which was a copy
  // of the interpolated SQL): parameters only — values are NEVER spliced
  // into SQL text; they go through better-sqlite3 parameter binding below.
  writeFileSync(resolve(outDir, 'candidate-insert.json'), JSON.stringify({
    db: FORGE_TRUTH_DB,
    class_slug: classSlug,
    api_version: apiVersion,
    scene_path: scenePath,
    report_path: reportPath,
    script_bytes: Buffer.byteLength(script),
    checks_bytes: Buffer.byteLength(checksJson),
  }, null, 2))
  let db: InstanceType<typeof Database> | null = null
  try {
    db = new Database(FORGE_TRUTH_DB, { timeout: 30_000 })
    db.exec(`CREATE TABLE IF NOT EXISTS authored_scene_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  script TEXT NOT NULL,
  api_version TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','shadow','approved')),
  UNIQUE(class_slug, version)
);`)
    // Single atomic statement preserves the COALESCE(MAX(version)) semantics
    // even with concurrent writers; every value arrives via binding.
    const info = db.prepare(
      `INSERT INTO authored_scene_candidates (class_slug, version, script, api_version, checks_json, status)
       VALUES (@slug,
               COALESCE((SELECT MAX(version) FROM authored_scene_candidates WHERE class_slug = @slug), 0) + 1,
               @script, @apiVersion, @checksJson, 'candidate')`
    ).run({ slug: classSlug, script, apiVersion, checksJson })
    const row = db.prepare(
      `SELECT id, class_slug, version, status FROM authored_scene_candidates WHERE rowid = ?`
    ).get(info.lastInsertRowid) as { id: number; class_slug: string; version: number; status: string }
    return `candidate id=${row.id} class=${row.class_slug} version=${row.version} status=${row.status}`
  } catch (err: any) {
    console.error(`[author] candidate-store insert FAILED: ${err?.message || err}`)
    return `INSERT FAILED: ${String(err?.message || err).slice(0, 200)}`
  } finally {
    db?.close()
  }
}

// ─── The loop (B3) — chain-integration surface ─────────────────────────────

export interface AuthorResult {
  ok: boolean
  classSlug: string
  iterations: number
  scenePath?: string
  reportPath?: string
  candidateRow?: string
  failure?: any
}

/**
 * THE chain-integration function (do NOT wire into serial-design-chain-v2.tsx
 * this increment — it is dirty in another workstream; see tracker item 10).
 * Call when generate-blender-scene.tsx returns 5 (registry miss). Returns
 * ok=false on non-convergence; the chain then falls back to its existing
 * no-scene behaviour and the render-quality gate flags the run (G3).
 */
export async function authorBlenderSceneForRegistryMiss(
  statePath: string, outDirArg?: string,
  opts?: { resume?: boolean }): Promise<AuthorResult> {
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const outDir = resolve(outDirArg || dirname(statePath))
  mkdirSync(outDir, { recursive: true })

  const digest = buildAuthorDigest(state)
  const spec = buildCheckSpec(digest)
  const specPath = resolve(outDir, 'scene-spec.json')
  writeFileSync(specPath, JSON.stringify(spec, null, 2))
  writeFileSync(resolve(outDir, 'design-digest.txt'), digest.text)

  // Standalone-runnable: lib + checks live next to the scene (also what the
  // candidate store snapshot expects).
  for (const f of ['forge_blender_lib.py', 'forge_scene_checks.py']) {
    copyFileSync(resolve(TEMPLATES_DIR, f), resolve(outDir, f))
  }

  const apiDoc = readFileSync(resolve(TEMPLATES_DIR, 'PRIMITIVE-API.md'), 'utf-8')
  const apiVersion = JSON.parse(
    readFileSync(resolve(TEMPLATES_DIR, 'primitive-api-schema.json'), 'utf-8')
  ).primitive_api_version || 'unknown'
  const basePrompt = buildAuthorPrompt(digest, apiDoc)

  console.log(`[author] class=${digest.classSlug} modules=${digest.moduleIds.length} ` +
              `envelope=${digest.envelopeMm.join('x')}mm masses=${Object.keys(digest.masses).length} ` +
              `model=${AUTHOR_MODEL} (fallback ${AUTHOR_FALLBACK})`)

  const messages: any[] = [{ role: 'user', content: basePrompt }]
  let model = AUTHOR_MODEL
  let lastFindings: any = null
  let iter = 0
  if (opts?.resume) iter = replayPriorIterations(outDir, digest.envelopeMm, messages)

  while (iter < MAX_ITERATIONS) {
    iter += 1
    const t0 = Date.now()
    let py = await callModel(messages, model)
    if (!py && model !== AUTHOR_FALLBACK) {
      console.error(`[author] ${model} failed — switching to fallback ${AUTHOR_FALLBACK}`)
      model = AUTHOR_FALLBACK
      py = await callModel(messages, model)
    }
    if (!py) {
      lastFindings = { error: 'LLM call failed on primary and fallback' }
      break
    }
    console.log(`[author] iter ${iter} [${model}]: ${py.split('\n').length} lines in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    const iterScene = resolve(outDir, `author-iter-${iter}.py`)
    writeFileSync(iterScene, py)
    messages.push({ role: 'assistant', content: py })

    // Static validation (AST + allowlist + kwarg schema)
    const v = staticValidate(iterScene)
    writeFileSync(resolve(outDir, `author-iter-${iter}-validate.json`), JSON.stringify(v.report, null, 2))
    if (!v.ok) {
      console.log(`[author] iter ${iter}: static validation FAILED (${v.report.violations?.length} violations)`)
      lastFindings = { stage: 'static_validation', violations: v.report.violations }
      messages.push({ role: 'user', content: staticFeedback(v.report.violations || []) })
      continue
    }

    // Deterministic geometry checks (headless Blender, render stubbed)
    const checkReport = resolve(outDir, `author-iter-${iter}-checks.json`)
    const c = blenderVerify(iterScene, specPath, checkReport, 'check', outDir)
    const counts = c.report?.counts || {}
    console.log(`[author] iter ${iter}: deterministic checks pass=${counts.pass ?? '?'} warn=${counts.warn ?? '?'} fail=${counts.fail ?? '?'}`)
    if (!c.ok) {
      const fails = (c.report.findings || []).filter((f: any) => f.status === 'fail')
      lastFindings = { stage: 'deterministic_checks', findings: fails }
      messages.push({ role: 'user', content: checksFeedback(fails, digest.envelopeMm) })
      continue
    }

    // ── CONVERGED — final render + persist + candidate row ──
    const scenePath = resolve(outDir, 'blender-scene.py')
    const reportPath = resolve(outDir, 'checks-report.json')
    writeFileSync(scenePath, py)
    console.log(`[author] iter ${iter}: CONVERGED — running full render pipeline (this renders hero + per-module PNGs)`)
    const r = blenderVerify(scenePath, specPath, reportPath, 'render', outDir)
    if (!r.ok) {
      // Geometry was clean in check mode; a render-mode regression is a real
      // failure (e.g. render crash) — treat as non-convergence, honest record.
      lastFindings = { stage: 'render', findings: (r.report.findings || []).filter((f: any) => f.status === 'fail') }
      console.error('[author] render-mode verification failed after check-mode pass')
      break
    }
    const candidateRow = recordCandidate(digest.classSlug, scenePath, reportPath, apiVersion, outDir)
    console.log(`[author] ${candidateRow}`)
    console.log(`[author] DONE in ${iter} iteration(s) — scene=${scenePath} report=${reportPath}`)
    console.log(`[author] LLM usage: ${llmCalls} calls, ${llmTokens.prompt} prompt + ${llmTokens.completion} completion tokens`)
    return { ok: true, classSlug: digest.classSlug, iterations: iter, scenePath, reportPath, candidateRow }
  }

  // ── G3: non-convergence — structured failure record, NO scene ──
  const failure = {
    status: 'non_converged',
    class_slug: digest.classSlug,
    iterations: iter,
    max_iterations: MAX_ITERATIONS,
    model_chain: [AUTHOR_MODEL, AUTHOR_FALLBACK],
    last_findings: lastFindings,
    llm_calls: llmCalls,
    note: 'authored-scene path halted per G3 — chain falls back to existing behaviour; render-quality gate flags it; class queued for human template authoring (ANVIL-UNIVERSAL-TRACKER)',
    created_at: new Date().toISOString(),
  }
  const failPath = resolve(outDir, 'author-failure.json')
  writeFileSync(failPath, JSON.stringify(failure, null, 2))
  console.error(`[author] NON-CONVERGED after ${iter} iteration(s) — ${failPath} (no scene emitted)`)
  return { ok: false, classSlug: digest.classSlug, iterations: iter, failure }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.length === 0 || !existsSync(resolve(args[0]))) {
    console.error('Usage: author-blender-scene.tsx <state.json> [--out <dir>] [--resume]')
    return 1
  }
  const outIdx = args.indexOf('--out')
  const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined
  const resume = args.includes('--resume')
  const res = await authorBlenderSceneForRegistryMiss(resolve(args[0]), outDir, { resume })
  return res.ok ? 0 : 5 // 5 = runner falls back to no-scene behaviour (G3)
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[author] FATAL: ${err?.stack || err}`)
      process.exit(1)
    })
}
