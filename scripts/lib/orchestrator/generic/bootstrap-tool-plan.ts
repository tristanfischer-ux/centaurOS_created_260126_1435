/**
 * scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts
 *
 * ON-THE-FLY TOOL-PLAN BOOTSTRAP-ON-MISS — the runtime answer to "REMOVE the
 * curation crutch" (Tristan 2026-06-14, tracker C1). MIRRORS the sibling
 * bootstrap-class-graph.ts EXACTLY (same Stage-0-harvest pattern: DB-first reuse
 * → LLM harvest → DETERMINISTIC validation → candidate store → consume), applied
 * to TOOL PLANS instead of class-reference GRAPHS.
 *
 * THE WALL THIS KILLS: for an UNREGISTERED product class (e.g. aquaculture_ras)
 * the orchestrator's selectPlan() returns null and falls to composeFallbackPlan
 * (auto-plan-fallback.ts), whose auto-planner selects "tools" by DOMAIN-BLIND
 * output-key string-matching. On the real RAS run that picked aircraft-airfoil
 * analysis, AUV submarine hydrostatics, and bicycle gear-ratio for a fish farm
 * (out/ras-r5-20260613/state.json :: orchestratorContract.quantities is littered
 * with `auto_planned_tool_ran__aerosandbox_airfoil_analysis`,
 * `auto_planned_tool_ran__auv_hydro_drag_buoyancy`, `…gear_ratio_bicycle`, …).
 *
 * There is NO fundamental difference between hand-writing a ClassToolPlan and
 * generating one at runtime — it is the same selection task. So the engine does,
 * AT RUNTIME, exactly what a human does when hand-writing a plan: read the
 * detailed brief, pick the tools that compute the needed duties, wire each to the
 * tools' REAL input/output field names, and run them — for ANY class, with NO
 * whitelist and NO per-class table. The plan is then CACHED (a growing DB the
 * engine fills itself) so re-runs are instant + free. The 35 hand-written plans
 * become FEW-SHOT EXAMPLES, then redundant.
 *
 * THE DECOMPOSITION (only ONE part needs care):
 *   (a) PICK the tools     = the LLM's judgement from brief + tool catalogue.
 *   (b) WIRE them          = the ONE careful part. A wired field that does not
 *       exist is REJECTED (V2), and at runtime a missing computed output field
 *       NEVER fabricates a number (fail-closed materialiser). This single
 *       safeguard is the whole point — it is what stops a hallucinated wiring
 *       from silently entering the engineering contract.
 *   (c) ORDER them         = DETERMINISTIC topo-sort, REUSING composeToolGraph's
 *       Tarjan-SCC + Kahn ordering from auto-planner.ts. The LLM need not get
 *       order right.
 *
 * PIPELINE (one call per novel slug per run):
 *   (0) DB-FIRST REUSE: newest VALID row in class_tool_plan_candidates for this
 *       slug → re-materialise + re-validate → return if clean (no LLM). On a
 *       registry change that breaks validation, regenerate.
 *   (a) TOOL CATALOGUE: for every registered tool (listTools()), a line with
 *       tool_id, name, description, domain, REAL input field names + REAL output
 *       field names (from the RAW-IO manifest — see I/O SOURCE below).
 *   (b) ONE LLM harvest: ONE structured google/gemini-3.5-flash call (OpenRouter,
 *       temp 0, max_tokens 150_000) given the DETAILED BRIEF (parsed brief +
 *       engineering-contract quantities describing what the system must DO), the
 *       full catalogue, and 2 hand-written plans rendered as the spec JSON as
 *       few-shot — picking the tools whose physics the brief needs + wiring each
 *       to real fields. 2-attempt retry-with-errors-fed-back loop.
 *   (c) DETERMINISTIC validation (no LLM decides — pure functions returning
 *       {ok, errors[]}): V1 tool ids exist (getTool); V2 every wired param +
 *       tool_output_field is a REAL key of that tool (THE safeguard); V3 the
 *       union of contract_keys covers the universal outputs + brief metric keys
 *       AND includes the universal mass producer (mass-aggregator:envelope-check).
 *   (d) ORDER: topo-sort the validated steps by data dependency, REUSING
 *       composeToolGraph (auto-planner.ts).
 *   (e) MATERIALISE into a runnable ClassToolPlan (the live type has FUNCTIONS,
 *       so rebuilt from the spec). input_from_contract builds the payload from
 *       inputs[]; contract_update writes mkQty(...) per outputs[] — BUT FAIL-
 *       CLOSED: if num(output, tool_output_field) is undefined at runtime, DO NOT
 *       write a fabricated number for a COMPUTED field — skip + warn. Every step
 *       required:false (a tool error can't halt a novel-class run).
 *   (f) STORE the candidate (status 'candidate', NEVER auto-promoted) + return
 *       the materialised plan + provenance.
 *
 * I/O SOURCE (documented per the spec's "investigate where those live"): the
 * materialiser calls `num(output, tool_output_field)` on the tool's RAW invoke()
 * OUTPUT OBJECT, and V2 must validate against those SAME raw field names. The
 * checked-in `tool-io-manifest.json` is NOT reliable for this: for ~half the
 * tools its output_keys are the POST-RENAME CANONICAL CONTRACT keys harvested
 * from the hand-plans (e.g. control-systems:pid-tuning → `pitch_loop_kp`), which
 * differ from the tool's actual python dict keys (`kp` / `foptd_K` / …). Using
 * canonical keys would BOTH wrongly accept a wiring AND make num() return
 * undefined at runtime. So the authoritative source here is the RAW-IO manifest
 * `tool-io-raw.json` — the tool's actual invoke() field names, produced by the
 * existing runtime harvester (harvest-tool-io-runtime.py, which executes every
 * python-wrapped tool live against the repo .venv and records the returned dict
 * keys). The ~26 pure-TS tools that have no python wrapper (incl. the universal
 * `mass-aggregator:envelope-check`) are absent from the raw manifest; for those
 * we MERGE IN tool-io-manifest.json's keys (their hand-plan canonical keys equal
 * their TS invoke fields, verified against tools/mass-aggregator.ts). Net: every
 * registered tool gets raw-correct invoke() field names. Regenerate the raw
 * manifest the same way as the merged one:
 *   python3 scripts/lib/orchestrator/harvest-tool-io-runtime.py \
 *     --out=scripts/lib/orchestrator/tool-io-raw.json
 *
 * SCOPE GUARD: only reachable from orchestrate.ts on the selectPlan-MISS path —
 * the 35 registered classes (which match a hand-written plan) never get here.
 * Env-gated UNIVERSAL_TOOL_PLAN_BOOTSTRAP (default ON; set =0 to disable),
 * mirroring CLASS_GRAPH_BOOTSTRAP. Status stays 'candidate' — NO auto-promotion.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

import type {
  BriefEnvelope,
  ClassToolPlan,
  ContractInProgress,
  ParsedConstraints,
  ToolStep,
} from '../types'
import { getTool, listTools } from '../registry'
import { composeToolGraph, type ToolIOSchema } from '../auto-planner'

// ── Constants ───────────────────────────────────────────────────────────────

const FORGE_TRUTH_DB = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const HARVEST_MODEL = 'google/gemini-3.5-flash'
const MAX_OUTPUT_TOKENS = 150_000 // repo rule: 150_000 everywhere in pdf-engine-v2
const BOOTSTRAP_SOURCE = `tool-plan-bootstrap@v1:${HARVEST_MODEL}+catalogue`
export const BOOTSTRAP_PROVENANCE = 'tool-plan-bootstrap-candidate@v1'

// Security item 18 pattern: the slug keys DB rows → validate at the boundary,
// bind every value, never string-interpolate.
const SLUG_RE = /^[a-z0-9_]{1,64}$/

// The universal "buildable-design" producer + cost coverage the materialised
// plan must reach (V3). mass-aggregator:envelope-check is the canonical mass
// producer (pure-TS tool) every registered plan ends with — its raw invoke
// output field `total_system_mass_kg` is the headline mass the cost stack reads.
const UNIVERSAL_MASS_PRODUCER = 'mass-aggregator:envelope-check'
const UNIVERSAL_MASS_KEY = 'total_system_mass_kg'
// A cost-stack driver must be covered: any contract_key whose name contains one
// of these tokens counts (cost/capex/price/gbp). Kept token-based (not a fixed
// key) because cost surfaces under many names across tools (total_cost_gbp,
// estimated_capex_gbp, cost_estimate_gbp, …).
const COST_KEY_TOKENS = ['cost', 'capex', 'price', 'gbp']

// Few-shot exemplar plans (rendered to the spec JSON below).
const FEWSHOT_PLAN_FILES = ['co2-mineralisation', 'e-fuel-synthesis'] as const

// ── Serialisable plan spec (the LLM's output schema) ────────────────────────

export interface ToolPlanInputSpec {
  /** A REAL input field name of the tool (validated V2). */
  param: string
  /** Read this value from contract.quantities[<key>].value (q()). null/omitted
   *  → use `constant`. */
  from_contract_key?: string | null
  /** A literal numeric/boolean/string constant to pass when from_contract_key is
   *  absent. */
  constant?: number | string | boolean
  /** Fallback numeric for q(c, key, fallback) when the contract lacks the key.
   *  Applies ONLY to from_contract_key inputs (an INPUT default, NOT a fabricated
   *  COMPUTED output — those are fail-closed). */
  fallback?: number
}

export interface ToolPlanOutputSpec {
  /** Contract quantity key to WRITE (e.g. recirc_pump_motor_kw). */
  contract_key: string
  /** A REAL output field name of the tool's invoke() dict (validated V2). */
  tool_output_field: string
  /** Canonical unit string (e.g. 'kW', 'm3/h', 'kg'). */
  unit: string
  /** UnitFamily-ish tag (free text; mkQty stores it; downstream casts). */
  family: string
  /** Optional human qualifier shown in the quantity `condition`. */
  condition?: string
}

export interface ToolPlanStepSpec {
  /** Registered tool id (validated V1). */
  tool_id: string
  /** One-line purpose (what duty this step computes). */
  purpose?: string
  inputs: ToolPlanInputSpec[]
  outputs: ToolPlanOutputSpec[]
}

export interface ToolPlanSpec {
  display_name: string
  steps: ToolPlanStepSpec[]
}

// ── Public result types ─────────────────────────────────────────────────────

export interface ToolPlanBootstrapSuccess {
  ok: true
  plan: ClassToolPlan
  spec: ToolPlanSpec
  provenance: typeof BOOTSTRAP_PROVENANCE
  candidate: { id: number; slug: string; version: number; status: string; reused: boolean }
  attempts: number
  selected_tool_ids: string[]
  llm_cost_usd: number | null
}

export interface ToolPlanBootstrapFailure {
  ok: false
  slug: string
  attempts: number
  stage: 'invalid-slug' | 'no-api-key' | 'empty-catalogue' | 'llm-call' | 'validation' | 'candidate-store'
  validation_errors: string[]
  error: string
}

export type ToolPlanBootstrapResult = ToolPlanBootstrapSuccess | ToolPlanBootstrapFailure

// ── Tool I/O catalogue (RAW invoke field names) ─────────────────────────────

export interface ToolCatalogueEntry {
  tool_id: string
  name: string
  description: string
  domain: string
  input_fields: string[]
  output_fields: string[]
}

interface RawManifestEntry { input_keys?: string[]; output_keys?: string[] }
type RawManifest = Record<string, RawManifestEntry>

let _catalogueCache: ToolCatalogueEntry[] | null = null
let _ioByToolCache: Map<string, { inputs: Set<string>; outputs: Set<string> }> | null = null

function readJsonManifest(filename: string): RawManifest {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, '..', filename), 'utf-8')) as RawManifest
  } catch {
    return {}
  }
}

/** Cache of tool_id → wrapper-source `input.<field>` reads (pure-TS fallback). */
let _tsInputCache: Map<string, Set<string>> | null = null

/**
 * For the handful of registered PURE-TS tools the python runtime harvester never
 * ran (octopart:parts-lookup, iec-standards:lookup, mass-aggregator:envelope-
 * check), source-parse their wrapper's `input.<field>` reads to recover the REAL
 * TS input-interface field names. The merged manifest's input_keys for these
 * came from hand-plan `c.quantities?.X` contract reads, which are INCOMPLETE
 * (e.g. they miss mass-aggregator's `max_mass_kg_envelope`) — relying on them
 * would false-reject a legitimate wiring at V2. Self-correcting (no out-of-band
 * regenerate): scans tools/*.ts once, matches the tool_id literal, harvests
 * `input.<field>`. Cached. Never throws.
 */
function tsInputFieldsFor(toolId: string): Set<string> {
  if (!_tsInputCache) {
    _tsInputCache = new Map<string, Set<string>>()
    const toolsDir = resolve(__dirname, '..', 'tools')
    try {
      const files = readdirSync(toolsDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      // tool_id → source (first wrapper file that mentions the id literal).
      const srcById = new Map<string, string>()
      for (const f of files) {
        let src: string
        try { src = readFileSync(resolve(toolsDir, f), 'utf-8') } catch { continue }
        for (const m of src.matchAll(/['"]([a-z0-9-]+:[a-z0-9-]+)['"]/g)) {
          if (!srcById.has(m[1])) srcById.set(m[1], src)
        }
      }
      for (const [id, src] of srcById) {
        const fields = new Set<string>()
        for (const m of src.matchAll(/\binput\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) fields.add(m[1])
        if (fields.size > 0) _tsInputCache.set(id, fields)
      }
    } catch { /* tools dir unreadable — pure-TS fallback simply contributes nothing */ }
  }
  return _tsInputCache.get(toolId) ?? new Set<string>()
}

/**
 * Build the per-tool RAW invoke() I/O map — the authoritative I/O the wiring is
 * validated + materialised against. Per-source precedence:
 *   outputs: tool-io-raw.json (the runtime harvester's REAL python dict keys)
 *            when present, else tool-io-manifest.json (correct for the pure-TS
 *            tools, whose canonical keys equal their TS invoke fields).
 *   inputs:  union of tool-io-raw.json + tool-io-manifest.json + (for pure-TS
 *            tools absent from raw) the wrapper's source-parsed `input.<field>`
 *            reads — a SUPERSET is safe (V2 only rejects a param in NEITHER), and
 *            the source-parse closes the incomplete-input-set false-reject gap.
 * Keyed by tool_id; only REGISTERED tools are included. Cached.
 */
export function buildToolIoMap(): Map<string, { inputs: Set<string>; outputs: Set<string> }> {
  if (_ioByToolCache) return _ioByToolCache
  const raw = readJsonManifest('tool-io-raw.json')
  const merged = readJsonManifest('tool-io-manifest.json')
  const map = new Map<string, { inputs: Set<string>; outputs: Set<string> }>()
  for (const [id, tool] of listTools()) {
    void tool
    const r = raw[id]
    const m = merged[id]
    const outputs = (r?.output_keys && r.output_keys.length > 0) ? r.output_keys : (m?.output_keys ?? [])
    const inputs = new Set<string>([...(r?.input_keys ?? []), ...(m?.input_keys ?? [])])
    // Pure-TS tools the python harvester never ran: add their real TS input
    // fields so V2 does not false-reject a legitimate wiring.
    if (!r) for (const f of tsInputFieldsFor(id)) inputs.add(f)
    map.set(id, { inputs, outputs: new Set(outputs) })
  }
  _ioByToolCache = map
  return map
}

/** The catalogue lines handed to the LLM. One per registered tool that has at
 *  least one known output field (a tool with no declared outputs cannot be wired
 *  to a contract_key, so it is not offered). Cached. */
export function buildToolCatalogue(): ToolCatalogueEntry[] {
  if (_catalogueCache) return _catalogueCache
  const io = buildToolIoMap()
  const out: ToolCatalogueEntry[] = []
  for (const [id, tool] of listTools()) {
    const fields = io.get(id)
    const outputs = fields ? [...fields.outputs].sort() : []
    if (outputs.length === 0) continue // can't wire a contract_key to it
    out.push({
      tool_id: id,
      name: tool.name ?? id,
      description: describeTool(tool),
      domain: String(tool.domain ?? 'unknown'),
      input_fields: fields ? [...fields.inputs].sort() : [],
      output_fields: outputs,
    })
  }
  out.sort((a, b) => a.tool_id.localeCompare(b.tool_id))
  _catalogueCache = out
  return out
}

/** Test seam: reset the catalogue/IO caches (e.g. after registering test tools). */
export function _resetCatalogueCacheForTests(): void {
  _catalogueCache = null
  _ioByToolCache = null
  _tsInputCache = null
}

/** A short, model-readable description of a tool. The Tool type has no
 *  description field, so synthesise one from name + domain + id sub-capability. */
function describeTool(tool: { id: string; name?: string; domain?: string }): string {
  const sub = tool.id.includes(':') ? tool.id.split(':')[1].replace(/-/g, ' ') : tool.id
  const name = tool.name ?? tool.id
  return `${name} — ${sub} (${tool.domain ?? 'unknown'} domain)`
}

// ── (c) DETERMINISTIC validation — pure, decides (no LLM) ───────────────────

export interface PlanValidation {
  ok: boolean
  errors: string[]
  spec?: ToolPlanSpec
}

/**
 * Validate a raw harvested object into a ToolPlanSpec. Pure + deterministic.
 *   V1 every step.tool_id exists via getTool (no hallucinated tool ids).
 *   V2 every inputs[].param is a real input field of that tool, AND every
 *      outputs[].tool_output_field is a real OUTPUT field of that tool — THE key
 *      safeguard (no hallucinated fields enter the wiring).
 *   V3 the union of outputs[].contract_key covers the universal outputs
 *      (total_system_mass_kg via the universal mass producer + a cost key) + the
 *      brief's metric keys; and the plan includes mass-aggregator:envelope-check.
 *
 * `briefMetricKeys` are the contract_key targets the brief demands (the parsed
 * brief's scale/performance metric keys). Coverage is satisfied if a metric key
 * is produced by SOME step OR already supplied by the contract (passed via
 * `contractSuppliedKeys`) — a brief input the design echoes need not be recomputed.
 */
export function validateToolPlanSpec(
  raw: unknown,
  briefMetricKeys: string[] = [],
  contractSuppliedKeys: string[] = [],
): PlanValidation {
  const errors: string[] = []
  const g = raw as Record<string, any>
  if (!g || typeof g !== 'object') return { ok: false, errors: ['spec is not an object'] }

  const displayName = typeof g.display_name === 'string' ? g.display_name.trim() : ''
  if (!displayName) errors.push('display_name missing or empty')

  const io = buildToolIoMap()
  const rawSteps: any[] = Array.isArray(g.steps) ? g.steps : []
  if (rawSteps.length === 0) errors.push('steps missing or empty')

  const steps: ToolPlanStepSpec[] = []
  const producedContractKeys = new Set<string>()

  for (const [i, s] of rawSteps.entries()) {
    const toolId = typeof s?.tool_id === 'string' ? s.tool_id.trim() : ''
    // V1 — tool id exists in the live registry.
    if (!toolId || !getTool(toolId)) {
      errors.push(`step[${i}] tool_id "${toolId}" is not a registered tool (V1)`) // hallucinated/dangling id
      continue
    }
    const fields = io.get(toolId)
    const realInputs = fields?.inputs ?? new Set<string>()
    const realOutputs = fields?.outputs ?? new Set<string>()

    // V2a — every wired input param is a real input field of the tool.
    const rawInputs: any[] = Array.isArray(s?.inputs) ? s.inputs : []
    const inputs: ToolPlanInputSpec[] = []
    for (const [j, inp] of rawInputs.entries()) {
      const param = typeof inp?.param === 'string' ? inp.param.trim() : ''
      if (!param) { errors.push(`step[${i}] "${toolId}" inputs[${j}] param missing`); continue }
      if (realInputs.size > 0 && !realInputs.has(param)) {
        errors.push(`step[${i}] "${toolId}" inputs[${j}] param "${param}" is not a real input field of the tool (V2)`)
        continue
      }
      const fromKey = typeof inp?.from_contract_key === 'string' && inp.from_contract_key.trim()
        ? inp.from_contract_key.trim() : null
      const spec: ToolPlanInputSpec = { param, from_contract_key: fromKey }
      if (fromKey == null) {
        if (inp?.constant === undefined) {
          errors.push(`step[${i}] "${toolId}" inputs[${j}] "${param}" has neither from_contract_key nor constant`)
          continue
        }
        spec.constant = inp.constant
      }
      if (typeof inp?.fallback === 'number' && Number.isFinite(inp.fallback)) spec.fallback = inp.fallback
      inputs.push(spec)
    }

    // V2b — every wired output field is a real OUTPUT field of the tool.
    const rawOutputs: any[] = Array.isArray(s?.outputs) ? s.outputs : []
    const outputs: ToolPlanOutputSpec[] = []
    for (const [j, o] of rawOutputs.entries()) {
      const contractKey = typeof o?.contract_key === 'string' ? o.contract_key.trim() : ''
      const toolField = typeof o?.tool_output_field === 'string' ? o.tool_output_field.trim() : ''
      if (!contractKey) { errors.push(`step[${i}] "${toolId}" outputs[${j}] contract_key missing`); continue }
      if (!toolField) { errors.push(`step[${i}] "${toolId}" outputs[${j}] tool_output_field missing`); continue }
      // THE safeguard: the tool_output_field MUST be a real invoke() output field.
      if (realOutputs.size > 0 && !realOutputs.has(toolField)) {
        errors.push(`step[${i}] "${toolId}" outputs[${j}] tool_output_field "${toolField}" is not a real output field of the tool (V2 — hallucinated field)`)
        continue
      }
      outputs.push({
        contract_key: contractKey,
        tool_output_field: toolField,
        unit: typeof o?.unit === 'string' ? o.unit : '',
        family: typeof o?.family === 'string' && o.family ? o.family : 'dimensionless',
        condition: typeof o?.condition === 'string' ? o.condition.slice(0, 160) : undefined,
      })
      producedContractKeys.add(contractKey)
    }

    steps.push({
      tool_id: toolId,
      purpose: typeof s?.purpose === 'string' ? s.purpose.slice(0, 200) : undefined,
      inputs,
      outputs,
    })
  }

  // V3 — universal coverage + the universal mass producer must be present.
  const stepIds = new Set(steps.map(s => s.tool_id))
  if (!stepIds.has(UNIVERSAL_MASS_PRODUCER)) {
    errors.push(`plan must include the universal mass producer "${UNIVERSAL_MASS_PRODUCER}" (V3)`) // total mass + envelope check
  }
  if (!producedContractKeys.has(UNIVERSAL_MASS_KEY)) {
    errors.push(`plan must produce the universal output "${UNIVERSAL_MASS_KEY}" (V3) — wire ${UNIVERSAL_MASS_PRODUCER}'s ${UNIVERSAL_MASS_KEY} output field to it`)
  }
  const hasCostKey = [...producedContractKeys].some(k => {
    const kl = k.toLowerCase()
    return COST_KEY_TOKENS.some(t => kl.includes(t))
  })
  if (!hasCostKey) {
    errors.push(`plan must produce a cost/capex key (V3) — wire a cost-bearing tool output (e.g. regulatory-cert-cost:lookup total_cost_gbp, or a tool's estimated_capex_gbp)`) // cost-stack driver
  }
  // Brief metric coverage: each demanded metric key must be produced OR already
  // supplied by the contract (an echoed brief input need not be recomputed).
  const supplied = new Set(contractSuppliedKeys.map(k => k.toLowerCase()))
  for (const mk of briefMetricKeys) {
    const mkl = mk.toLowerCase()
    if (producedContractKeys.has(mk) || supplied.has(mkl)) continue
    // tolerant match: a produced key that contains the metric token-set, or vice versa
    const covered = [...producedContractKeys].some(pk => keyCoarseMatch(pk, mk))
    if (!covered) {
      errors.push(`brief metric key "${mk}" is not produced by any step nor supplied by the contract (V3)`) // coverage gap
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, errors: [], spec: { display_name: displayName, steps } }
}

/** Coarse token-overlap match for brief-metric coverage only (NOT used for V2,
 *  which is exact). A produced key covers a metric key if one is a _-token
 *  superset of the other sharing the distinctive (non-unit) tokens. */
function keyCoarseMatch(produced: string, metric: string): boolean {
  const strip = (k: string) => k.toLowerCase().split('_').filter(t =>
    t.length >= 3 && !['the', 'per', 'kg', 'kw', 'kwh', 'm2', 'm3', 'gbp', 'pct', 'tpy', 'yr', 'day'].includes(t))
  const a = new Set(strip(produced))
  const b = strip(metric)
  if (b.length === 0) return false
  const overlap = b.filter(t => a.has(t)).length
  return overlap >= Math.min(2, b.length)
}

// ── (b) LLM harvest — ONE structured call per attempt ───────────────────────

/** Render a hand-written class-plan file to the spec JSON as a few-shot example.
 *  Parses the file's ToolStep declarations: tool_id, the c.quantities reads in
 *  input_from_contract (→ inputs.from_contract_key), and the
 *  `contract_key: mkQty(num(output, 'FIELD')…)` writes (→ outputs). Best-effort —
 *  a fully faithful example is not required, only a representative one. */
function renderFewShotFromPlanSource(slug: string): string | null {
  let src: string
  try {
    src = readFileSync(resolve(__dirname, '..', 'class-plans', `${slug}.ts`), 'utf-8')
  } catch {
    return null
  }
  // Slice into per-step segments at each `tool_id: '...'` boundary.
  const marks: Array<{ id: string; idx: number }> = []
  const idRe = /tool_id:\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = idRe.exec(src)) !== null) marks.push({ id: m[1], idx: m.index })
  const steps: ToolPlanStepSpec[] = []
  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : src.length)
    const inputs: ToolPlanInputSpec[] = []
    const seenIn = new Set<string>()
    // q(c, 'key', fallback) reads → from_contract_key inputs (param name unknown
    // from source reliably, so use the contract key as the param hint).
    for (const mm of body.matchAll(/q\(\s*c\s*,\s*'([a-z0-9_]+)'\s*,\s*([0-9.]+)/g)) {
      if (seenIn.has(mm[1])) continue
      seenIn.add(mm[1])
      inputs.push({ param: mm[1], from_contract_key: mm[1], fallback: Number(mm[2]) })
    }
    const outputs: ToolPlanOutputSpec[] = []
    // contract_key: mkQty(num(output, 'FIELD' [, 'FIELD2']) ?? …, 'unit', 'family', …)
    for (const mm of body.matchAll(/(\w+):\s*mkQty\(\s*num\(\s*output\s*,\s*'([a-z0-9_.]+)'[^)]*\)[^,]*,\s*'([^']*)'\s*,\s*'([^']*)'/g)) {
      outputs.push({ contract_key: mm[1], tool_output_field: mm[2], unit: mm[3], family: mm[4] })
    }
    if (outputs.length > 0) steps.push({ tool_id: marks[i].id, inputs, outputs })
  }
  if (steps.length === 0) return null
  const spec: ToolPlanSpec = { display_name: slug.replace(/-/g, ' '), steps }
  return JSON.stringify(spec, null, 2)
}

function buildHarvestPrompt(
  slug: string,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
  contractQuantities: ReadonlyArray<{ key: string; value: number; unit: string; condition?: string | null }>,
  catalogue: ToolCatalogueEntry[],
  briefMetricKeys: string[],
  priorErrors: string[],
): string {
  const desc = String(brief.product_description ?? '').slice(0, 5000)

  const dutyLines = contractQuantities
    .slice(0, 120)
    .map(q => `- ${q.key} = ${q.value} ${q.unit}${q.condition ? ` (${q.condition})` : ''}`)
    .join('\n')

  const catalogueLines = catalogue
    .map(c =>
      `- ${c.tool_id} [${c.domain}] ${c.description}\n` +
      `    inputs: ${c.input_fields.join(', ') || '(none)'}\n` +
      `    outputs: ${c.output_fields.join(', ') || '(none)'}`,
    )
    .join('\n')

  const fewShots = FEWSHOT_PLAN_FILES
    .map(f => ({ f, json: renderFewShotFromPlanSource(f) }))
    .filter(x => x.json)
    .map(x => `EXAMPLE PLAN — "${x.f}" (a hand-written plan, in the SAME output schema):\n${x.json}`)
    .join('\n\n')

  return (
    `You are a senior systems engineer composing a TOOL PLAN for a NOVEL product ` +
    `class the deterministic engineering-design pipeline has never seen. You do EXACTLY ` +
    `what a human does when hand-writing a class plan: read the detailed brief, pick the ` +
    `engineering/physics TOOLS whose computations the brief NEEDS, and WIRE each tool to ` +
    `the REAL input/output field names listed in the catalogue. Be physically faithful to ` +
    `THIS product — do NOT reach for tools from a different domain (no aircraft/airfoil, ` +
    `submarine/AUV-hydrostatics, spacecraft, or bicycle tools unless the product genuinely ` +
    `is one).\n\n` +
    `PRODUCT CLASS SLUG: "${slug}"\n` +
    `ENVELOPE: class=${envelope.class}, scale_tier=${envelope.scale_tier}, voltage_tier=${envelope.voltage_tier}, form_factor=${envelope.form_factor}, application=${envelope.application}\n\n` +
    `BRIEF:\n${desc}\n\n` +
    (dutyLines
      ? `ENGINEERING DUTIES THE SYSTEM MUST PERFORM (the parsed engineering-contract quantities — pick tools that COMPUTE or CONSUME these):\n${dutyLines}\n\n`
      : '') +
    (briefMetricKeys.length > 0
      ? `BRIEF TARGET METRIC KEYS (your plan must produce these as contract_key, OR they are already supplied above):\n- ${briefMetricKeys.join('\n- ')}\n\n`
      : '') +
    `TOOL CATALOGUE (the ONLY tools you may use; the inputs/outputs are the ONLY field names you may wire — any other name is REJECTED):\n${catalogueLines}\n\n` +
    (fewShots ? `${fewShots}\n\n` : '') +
    `OUTPUT RULES (validated DETERMINISTICALLY — violations are rejected):\n` +
    `1. Pick the SMALLEST set of tools that computes the brief's duties — typically 6-20. Each tool_id MUST be one from the catalogue.\n` +
    `2. For each step, wire inputs[].param to a REAL input field of that tool. Read a value from an upstream/brief quantity with from_contract_key (a contract key); else give a literal constant. Add a numeric fallback for from_contract_key inputs.\n` +
    `3. For each step, wire outputs[]: contract_key is the NEW quantity name you write; tool_output_field MUST be a REAL output field of that tool (exactly as spelled in the catalogue). Give unit + family.\n` +
    `4. You MUST include the tool "${UNIVERSAL_MASS_PRODUCER}" and wire its "${UNIVERSAL_MASS_KEY}" output field to a contract_key "${UNIVERSAL_MASS_KEY}" (the whole-system mass + envelope check every design needs). Feed it the principal equipment mass buckets via its input fields.\n` +
    `5. You MUST produce at least one cost/capex key (wire a cost-bearing tool output, e.g. regulatory-cert-cost:lookup → total_cost_gbp, or a tool's estimated_capex_gbp).\n` +
    `6. Do NOT worry about run ORDER — it is computed deterministically from your wiring. Wire data dependencies via matching contract_key → from_contract_key across steps.\n` +
    (priorErrors.length > 0
      ? `\nYOUR PREVIOUS ATTEMPT FAILED DETERMINISTIC VALIDATION. Fix EVERY error (do NOT invent field names — use ONLY the catalogue's exact spellings):\n${priorErrors.map(e => `- ${e}`).join('\n')}\n`
      : '') +
    `\nReturn STRICT JSON only (no markdown fence, no commentary):\n` +
    `{"display_name": "<class display name>", "steps": [{"tool_id": "...", "purpose": "<one line>", ` +
    `"inputs": [{"param": "<real input field>", "from_contract_key": "<contract key or null>", "constant": <optional literal>, "fallback": <optional number>}], ` +
    `"outputs": [{"contract_key": "<new quantity name>", "tool_output_field": "<real output field>", "unit": "...", "family": "...", "condition": "<optional>"}]}]}`
  )
}

interface HarvestOutcome {
  parsed: unknown | null
  costUsd: number | null
  error: string | null
}

async function harvestPlanViaLLM(prompt: string): Promise<HarvestOutcome> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { parsed: null, costUsd: null, error: 'OPENROUTER_API_KEY not set' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS tool-plan bootstrap',
      },
      body: JSON.stringify({
        model: HARVEST_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) return { parsed: null, costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { parsed: null, costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})` }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return { parsed: null, costUsd, error: 'no JSON object in completion' }
    try {
      return { parsed: JSON.parse(cleaned.slice(a, b + 1)), costUsd, error: null }
    } catch (err) {
      return { parsed: null, costUsd, error: `JSON parse failed: ${(err as Error).message}` }
    }
  } catch (err) {
    return { parsed: null, costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}` }
  }
}

// ── (f) Candidate store — class_tool_plan_candidates ────────────────────────

function openCandidateDb(dbPath: string = FORGE_TRUTH_DB): Database.Database {
  const db = new Database(dbPath, { timeout: 30_000 })
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')
  db.exec(`CREATE TABLE IF NOT EXISTS class_tool_plan_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  plan_json TEXT NOT NULL,
  source TEXT NOT NULL,
  verify_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','shadow','approved')),
  UNIQUE(slug, version)
);`)
  return db
}

/** Boundary validation BEFORE any DB use (security item 18 pattern). */
export function assertCandidateSlug(slug: string): void {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`[bootstrap-tool-plan] candidate-store input rejected: ${JSON.stringify({
      error: 'candidate_store_input_rejected',
      field: 'slug',
      rule: 'must match /^[a-z0-9_]{1,64}$/',
      value: String(slug).slice(0, 120),
    })}`)
  }
}

interface CandidateRow { id: number; slug: string; version: number; plan_json: string; status: string }

/** Newest stored candidate for a slug (any status), or null. Read-only. */
export function latestCandidate(slug: string, dbPath: string = FORGE_TRUTH_DB): CandidateRow | null {
  assertCandidateSlug(slug)
  if (!existsSync(dbPath)) return null
  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='class_tool_plan_candidates'`).get()
    if (!exists) return null
    return (db.prepare(
      `SELECT id, slug, version, plan_json, status FROM class_tool_plan_candidates
       WHERE slug = ? ORDER BY version DESC LIMIT 1`,
    ).get(slug) as CandidateRow | undefined) ?? null
  } catch (err) {
    console.warn(`[bootstrap-tool-plan] latestCandidate read failed: ${(err as Error).message}`)
    return null
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

/** INSERT a new candidate row (status 'candidate', version = MAX+1, atomic).
 *  Bound parameters only — slug validated at the boundary, NEVER interpolated. */
export function storeCandidate(
  slug: string,
  spec: ToolPlanSpec,
  verify: { selected_tool_ids: string[]; attempts: number } | null = null,
  dbPath: string = FORGE_TRUTH_DB,
): { id: number; version: number; status: string } {
  assertCandidateSlug(slug)
  let db: Database.Database | null = null
  try {
    db = openCandidateDb(dbPath)
    const info = db.prepare(
      `INSERT INTO class_tool_plan_candidates (slug, version, plan_json, source, verify_json, status)
       VALUES (@slug,
               COALESCE((SELECT MAX(version) FROM class_tool_plan_candidates WHERE slug = @slug), 0) + 1,
               @planJson, @source, @verifyJson, 'candidate')`,
    ).run({
      slug,
      planJson: JSON.stringify(spec),
      source: BOOTSTRAP_SOURCE,
      verifyJson: verify ? JSON.stringify(verify) : null,
    })
    const row = db.prepare(
      `SELECT id, version, status FROM class_tool_plan_candidates WHERE rowid = ?`,
    ).get(info.lastInsertRowid) as { id: number; version: number; status: string }
    return row
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

// ── (e) MATERIALISE the spec into a runnable ClassToolPlan ──────────────────

// Mirror the co2-mineralisation plan's q/provFor/mkQty/num idiom (lines ~111-134).
const q = (c: ContractInProgress, key: string, fallback: number): number => {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function provFor(toolId: string) {
  return (field: string) => ({
    source: `tool:${toolId}` as const,
    tool_id: toolId,
    tool_version: 'bootstrap',
    tool_license: 'free-proprietary' as any,
    tool_source_url: `internal://forgeos/bootstrap/${toolId}`,
    invocation_output_field: field,
    duration_ms: 0,
  })
}
function mkQty(value: number, unit: string, family: string, provenance: any, condition: string): any {
  return { value, unit, family, basis: 'rated', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition, provenance }
}
const num = (o: any, field: string): number | undefined => {
  const v = o?.[field]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Build the input payload for a step from its inputs[] spec. from_contract_key
 *  → q(c, key, fallback); else the literal constant. */
function buildStepInput(step: ToolPlanStepSpec, c: ContractInProgress): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const inp of step.inputs) {
    if (inp.from_contract_key) {
      payload[inp.param] = q(c, inp.from_contract_key, typeof inp.fallback === 'number' ? inp.fallback : 0)
    } else if (inp.constant !== undefined) {
      payload[inp.param] = inp.constant
    }
  }
  return payload
}

/**
 * Apply a step's outputs[] to the contract — FAIL-CLOSED. For each output, read
 * the tool's REAL invoke field via num(output, tool_output_field). If it is
 * present, write mkQty(...). If it is UNDEFINED (the computed field is missing at
 * runtime), DO NOT write a fabricated number — skip the key and accumulate a
 * warning. This is the whole point: a missing COMPUTED output never becomes a
 * made-up quantity in the engineering contract.
 *
 * Returns the new contract + the skipped (failed-closed) keys for diagnostics.
 */
export function applyStepOutputs(
  step: ToolPlanStepSpec,
  c: ContractInProgress,
  output: any,
): { contract: ContractInProgress; skipped: string[] } {
  const p = provFor(step.tool_id)
  const quantities = { ...c.quantities }
  const skipped: string[] = []
  for (const o of step.outputs) {
    const v = num(output, o.tool_output_field)
    if (v === undefined) {
      // FAIL-CLOSED: missing computed output field → emit nothing for this key.
      skipped.push(`${o.contract_key}(${step.tool_id}.${o.tool_output_field})`)
      continue
    }
    quantities[o.contract_key] = mkQty(v, o.unit, o.family, p(o.tool_output_field), o.condition ?? 'rated')
  }
  return { contract: { ...c, quantities }, skipped }
}

/** Turn a validated + ordered spec into the runnable ClassToolPlan. One ToolStep
 *  per spec step; required:false (a novel-class tool error cannot halt the run);
 *  feeds_into derived from the data-flow edges in `order`/the spec wiring. */
export function materialisePlan(slug: string, spec: ToolPlanSpec, orderedToolIds: string[]): ClassToolPlan {
  // Re-order the spec steps to the deterministic topo order; keep duplicates
  // (multi-instance tool_ids) in their relative order within the same id.
  const orderedSteps = orderStepsByToolIds(spec.steps, orderedToolIds)

  // Derive feeds_into: step A feeds step B if a contract_key A writes is read by
  // B's from_contract_key. (Diagnostic only — the executor runs plan.tools in
  // array order, which is already the topo order.)
  const writesByTool = new Map<string, Set<string>>()
  for (const s of spec.steps) {
    const set = writesByTool.get(s.tool_id) ?? new Set<string>()
    for (const o of s.outputs) set.add(o.contract_key)
    writesByTool.set(s.tool_id, set)
  }

  const tools: ToolStep[] = orderedSteps.map((step) => {
    const downstream = new Set<string>()
    for (const other of spec.steps) {
      if (other.tool_id === step.tool_id) continue
      const reads = new Set(other.inputs.map(i => i.from_contract_key).filter(Boolean) as string[])
      if (step.outputs.some(o => reads.has(o.contract_key))) downstream.add(other.tool_id)
    }
    return {
      tool_id: step.tool_id,
      required: false, // SAFETY: a bootstrapped tool can never halt the plan
      feeds_into: [...downstream],
      input_from_contract: (c: ContractInProgress) => buildStepInput(step, c),
      contract_update: (c: ContractInProgress, output: unknown) => {
        const { contract, skipped } = applyStepOutputs(step, c, output)
        if (skipped.length > 0) {
          console.warn(
            `[bootstrap-tool-plan] FAIL-CLOSED ${step.tool_id}: missing computed output field(s) → ` +
            `emitted nothing for [${skipped.join(', ')}] (no fabricated number written)`,
          )
        }
        return contract
      },
    }
  })

  return {
    id: `bootstrap-plan/${slug}`,
    envelope_predicate: () => true, // only ever consulted on this synthesised instance
    tools,
    coupled_pairs: [], // deterministic topo order already linearised the DAG
    max_iterations: 2,
    convergence_tolerance_pct: 5.0,
    consistency_rules: [], // no class-specific cross-tool rules for a novel class
  }
}

/** Re-order spec steps to follow orderedToolIds. Steps sharing a tool_id (multi-
 *  instance) keep their original relative order; any step whose id is not in the
 *  order list is appended at the end (defensive). */
function orderStepsByToolIds(steps: ToolPlanStepSpec[], orderedToolIds: string[]): ToolPlanStepSpec[] {
  const byId = new Map<string, ToolPlanStepSpec[]>()
  for (const s of steps) {
    const arr = byId.get(s.tool_id) ?? []
    arr.push(s)
    byId.set(s.tool_id, arr)
  }
  const out: ToolPlanStepSpec[] = []
  const consumed = new Set<string>()
  for (const id of orderedToolIds) {
    const arr = byId.get(id)
    if (arr && arr.length > 0) { out.push(arr.shift() as ToolPlanStepSpec); if (arr.length === 0) consumed.add(id) }
  }
  // Append any leftover steps (ids not present in the order, or extra instances).
  for (const s of steps) if (!out.includes(s)) out.push(s)
  return out
}

/** (d) ORDER — reuse composeToolGraph to topo-sort the validated steps by data
 *  dependency. Each step is projected to a ToolIOSchema whose input_keys are its
 *  from_contract_key reads and output_keys are its contract_key writes; the
 *  required outputs are the union of all written keys so every step is retained.
 *  Returns the tool_id run order (composeToolGraph already de-dupes ids; multi-
 *  instance steps are re-expanded by orderStepsByToolIds). */
export function orderSpec(spec: ToolPlanSpec): string[] {
  // Aggregate per-tool I/O across (possibly multiple) steps of the same id.
  const byId = new Map<string, { inputs: Set<string>; outputs: Set<string> }>()
  for (const s of spec.steps) {
    const e = byId.get(s.tool_id) ?? { inputs: new Set<string>(), outputs: new Set<string>() }
    for (const i of s.inputs) if (i.from_contract_key) e.inputs.add(i.from_contract_key)
    for (const o of s.outputs) e.outputs.add(o.contract_key)
    byId.set(s.tool_id, e)
  }
  const registry: ToolIOSchema[] = [...byId.entries()].map(([tool_id, io]) => ({
    tool_id,
    input_keys: [...io.inputs],
    output_keys: [...io.outputs],
  }))
  const allWrittenKeys = [...new Set(registry.flatMap(r => r.output_keys))]
  // briefKeys empty: we want EVERY selected tool retained (the graph already only
  // contains tools the LLM selected). composeToolGraph's backward-chain from the
  // union of all outputs keeps them all, then topo-sorts by the derived edges.
  const graph = composeToolGraph(allWrittenKeys, registry, [], 'bootstrap')
  // graph.order contains the selected ids in topo order. Any id not reached
  // (isolated, no edges + not a producer of a required key — shouldn't happen
  // since every id produces a required key) is appended.
  const ordered = [...graph.order]
  for (const r of registry) if (!ordered.includes(r.tool_id)) ordered.push(r.tool_id)
  return ordered
}

// ── (a–f) Main entry ────────────────────────────────────────────────────────

/** Extract the brief's demanded metric keys (contract_key targets the plan should
 *  cover) from parsedBrief.constraints.target_performance.metrics[].key_metric. */
function briefMetricKeysFrom(brief: ParsedConstraints): string[] {
  const out = new Set<string>()
  const extra = (brief as any)?.extra ?? brief
  const constraints = (extra?.constraints ?? (brief as any)?.constraints) as any
  const tp = constraints?.target_performance ?? (brief as any)?.target_performance
  const pushKey = (k: unknown) => { if (typeof k === 'string' && /^[a-z0-9_]+$/.test(k)) out.add(k) }
  if (tp) {
    pushKey(tp.key_metric)
    if (Array.isArray(tp.metrics)) for (const mm of tp.metrics) pushKey(mm?.key_metric)
  }
  return [...out]
}

/**
 * Bootstrap a tool plan for a NOVEL slug. The returned plan is an in-memory
 * pass-through for THIS run; the stored row stays status 'candidate' (promotion
 * is a separate, human/shadow-gated step). Never writes to the registered plans.
 *
 * @param contractQuantities the partial engineering-contract quantities that
 *   describe the system's duties (key/value/unit), surfaced to the LLM as the
 *   detailed brief + used for the V3 contract-supplied coverage check.
 */
export async function bootstrapToolPlan(
  rawSlug: string,
  brief: ParsedConstraints,
  envelope: BriefEnvelope,
  contractQuantities: ReadonlyArray<{ key: string; value: number; unit: string; condition?: string | null }> = [],
): Promise<ToolPlanBootstrapResult> {
  // Normalise hyphens (genericEnvelope hyphenates non-minted novel slugs) to the
  // candidate-store alphabet, then validate at the boundary.
  const slug = String(rawSlug ?? '').trim().toLowerCase().replace(/-/g, '_')
  if (!SLUG_RE.test(slug)) {
    return { ok: false, slug, attempts: 0, stage: 'invalid-slug', validation_errors: [], error: `slug "${rawSlug}" does not sanitise to /^[a-z0-9_]{1,64}$/` }
  }

  const briefMetricKeys = briefMetricKeysFrom(brief)
  const contractSuppliedKeys = contractQuantities.map(q2 => q2.key)

  // (0) DB-FIRST REUSE: a previously stored candidate makes re-runs free +
  // deterministic. Re-validate against the CURRENT registry (a registry change
  // that breaks the wiring → regenerate).
  const prior = latestCandidate(slug)
  if (prior) {
    try {
      const v = validateToolPlanSpec(JSON.parse(prior.plan_json), briefMetricKeys, contractSuppliedKeys)
      if (v.ok && v.spec) {
        const order = orderSpec(v.spec)
        const plan = materialisePlan(slug, v.spec, order)
        console.error(
          `[bootstrap-tool-plan] REUSING stored candidate slug=${slug} version=${prior.version} status=${prior.status} ` +
          `(no LLM call; ${v.spec.steps.length} steps, ${new Set(order).size} tool_ids)`,
        )
        return {
          ok: true, plan, spec: v.spec, provenance: BOOTSTRAP_PROVENANCE,
          candidate: { id: prior.id, slug, version: prior.version, status: prior.status, reused: true },
          attempts: 0, selected_tool_ids: order, llm_cost_usd: null,
        }
      }
      console.warn(`[bootstrap-tool-plan] stored candidate v${prior.version} for ${slug} fails current validation (${v.errors.length} errors) — re-harvesting`)
    } catch { /* corrupt row — re-harvest */ }
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, slug, attempts: 0, stage: 'no-api-key', validation_errors: [], error: 'OPENROUTER_API_KEY not set — cannot harvest' }
  }

  const catalogue = buildToolCatalogue()
  if (catalogue.length === 0) {
    return { ok: false, slug, attempts: 0, stage: 'empty-catalogue', validation_errors: [], error: 'tool catalogue empty — register-all must be imported before bootstrapToolPlan so listTools() is populated' }
  }
  console.error(
    `[bootstrap-tool-plan] composing tool plan for novel slug=${slug} ` +
    `(catalogue=${catalogue.length} tools, brief_metric_keys=${briefMetricKeys.length}, contract_duties=${contractQuantities.length})`,
  )

  // (b)+(c) Harvest → validate, one retry with the errors fed back.
  let attempts = 0
  let totalCost = 0
  let lastErrors: string[] = []
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt
    const prompt = buildHarvestPrompt(slug, brief, envelope, contractQuantities, catalogue, briefMetricKeys, lastErrors)
    const outcome = await harvestPlanViaLLM(prompt)
    if (outcome.costUsd) totalCost += outcome.costUsd
    if (!outcome.parsed) {
      lastError = outcome.error ?? 'unknown harvest failure'
      console.warn(`[bootstrap-tool-plan] attempt ${attempt} LLM harvest failed: ${lastError}`)
      lastErrors = []
      continue
    }
    const v = validateToolPlanSpec(outcome.parsed, briefMetricKeys, contractSuppliedKeys)
    if (!v.ok || !v.spec) {
      lastErrors = v.errors
      lastError = `deterministic validation failed (${v.errors.length} errors)`
      console.warn(`[bootstrap-tool-plan] attempt ${attempt} validation failed:\n  ${v.errors.join('\n  ')}`)
      continue
    }

    // (d) ORDER + (e) MATERIALISE.
    const order = orderSpec(v.spec)
    const plan = materialisePlan(slug, v.spec, order)

    // (f) Candidate store — row stays 'candidate'; the run consumes in-memory.
    let candidate: { id: number; version: number; status: string }
    try {
      candidate = storeCandidate(slug, v.spec, { selected_tool_ids: order, attempts })
    } catch (err) {
      return {
        ok: false, slug, attempts, stage: 'candidate-store', validation_errors: [],
        error: `plan validated but candidate-store insert failed: ${(err as Error).message}`,
      }
    }
    console.error(
      `[bootstrap-tool-plan] BOOTSTRAPPED slug=${slug} steps=${v.spec.steps.length} tool_ids=${new Set(order).size} ` +
      `candidate_id=${candidate.id} version=${candidate.version} status=${candidate.status} ` +
      `attempts=${attempts} cost_usd=${totalCost.toFixed(4)} (stored as CANDIDATE only — NO auto-promotion). ` +
      `Selected: ${order.join(', ')}`,
    )
    return {
      ok: true, plan, spec: v.spec, provenance: BOOTSTRAP_PROVENANCE,
      candidate: { id: candidate.id, slug, version: candidate.version, status: candidate.status, reused: false },
      attempts, selected_tool_ids: order, llm_cost_usd: totalCost > 0 ? totalCost : null,
    }
  }

  // Honest structured failure — the caller keeps its loud exit / fallback.
  return {
    ok: false, slug, attempts,
    stage: lastErrors.length > 0 ? 'validation' : 'llm-call',
    validation_errors: lastErrors,
    error: lastError || 'harvest exhausted both attempts',
  }
}
