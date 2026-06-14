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
import { sweepToolRelevance, checkUnitCoverage } from './relevance-sweep'

// ── Constants ───────────────────────────────────────────────────────────────

const FORGE_TRUTH_DB = resolve(homedir(), '.forge-truth', 'forge-truth.db')
// Strong reasoner for the ONCE-per-class (cached) tool-plan generation — the same
// calibre that hand-wrote the curated class-plans, so the on-the-fly selection matches
// hand quality (the minimal RIGHT tool set, not a noisy superset). Cached in
// class_tool_plan_candidates, so the Pro cost (~$0.02) is paid once per class, never per
// run. Gemini 3.5 Flash picked a noisier set (Tristan 2026-06-14: "you did it by hand").
const HARVEST_MODEL = 'google/gemini-3.1-pro-preview'
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

// The universal whole-system aggregators the V3 coverage gate REQUIRES (mass +
// cost) MUST always survive the relevance sweep, even if the reasoner judges them
// NO for a given plant — without them the plan cannot validate. So the swept-
// relevant subset is UNIONed with these before the wiring harvest. A tool id is
// force-kept if it equals the mass producer OR its id carries a cost/economics
// token (so whichever cost tool the catalogue offers is retained).
const FORCE_KEEP_COST_TOKENS = ['cert-cost', 'yield-economics', 'npv', 'capex', 'cost', 'economic']

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
  /** RELEVANCE SWEEP outcome (Part A). null when the sweep was disabled or failed
   *  (→ the harvest saw the full catalogue, the prior free-pick behaviour). When
   *  present, `relevant_tool_ids` is the deterministic swept subset the wiring
   *  harvest was restricted to. */
  relevance?: {
    swept: boolean
    from_cache: boolean
    relevant_count: number
    catalogue_count: number
    relevant_tool_ids: string[]
    cache_key: string | null
  } | null
  /** COVERAGE GATE outcome (Part C): every brief-NAMED unit → its covering tool
   *  (or null = unsized, logged loudly). null on the reuse path when not recomputed. */
  coverage?: {
    named_units: string[]
    coverage: Array<{ unit: string; covered_by: string | null }>
    uncovered: string[]
  } | null
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

interface RawManifestEntry { input_keys?: string[]; output_keys?: string[]; io_source?: string }
type RawManifest = Record<string, RawManifestEntry>

let _catalogueCache: ToolCatalogueEntry[] | null = null
let _ioByToolCache: Map<string, { inputs: Set<string>; outputs: Set<string> }> | null = null

// ── IN-MEMORY RAW-IO OVERRIDE (runtime-generated tools) ─────────────────────
//
// TOOL-CREATION-ON-THE-FLY (2026-06-14): a tool GENERATED mid-chain (dynamic-
// tool.ts → tool-generator.ts) is registered via registerTool() at runtime, but
// it is absent from the on-disk tool-io-raw.json (that file is harvested out-of-
// band). Without its I/O, buildToolIoMap() would offer it ZERO output fields, the
// catalogue would skip it, and the planner could not wire it. So a generated tool
// injects its REAL invoke() field names here via registerDynamicToolIo(); the map
// builder MERGES this override with the disk manifest, treating it as the
// authoritative run-harvested source (io_source 'run'). The override survives a
// cache reset (it is the durable in-memory record), so re-validation on reuse
// still sees the generated tool's fields. Persisted to disk separately by the
// candidate store so a FUTURE process also sees it (DB-first reuse).
const _dynamicIoOverride = new Map<string, RawManifestEntry>()

/**
 * Register (or replace) the RAW invoke() I/O of a runtime-generated tool so the
 * catalogue + the V1/V2 validators accept + wire it WITHOUT rewriting
 * tool-io-raw.json on disk. Resets the catalogue/IO caches so the next
 * buildToolCatalogue()/buildToolIoMap() includes it. io_source is forced to 'run'
 * (these ARE the executing tool's real field names — same authority as the python
 * runtime harvester).
 */
export function registerDynamicToolIo(toolId: string, inputKeys: string[], outputKeys: string[]): void {
  _dynamicIoOverride.set(toolId, {
    input_keys: [...new Set(inputKeys)],
    output_keys: [...new Set(outputKeys)],
    io_source: 'run',
  })
  // Invalidate caches so the freshly-registered tool's I/O is picked up.
  _catalogueCache = null
  _ioByToolCache = null
}

/** Test seam / introspection: the current in-memory dynamic IO overrides. */
export function _dynamicToolIoOverrides(): ReadonlyMap<string, RawManifestEntry> {
  return _dynamicIoOverride
}

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
  const rawDisk = readJsonManifest('tool-io-raw.json')
  const merged = readJsonManifest('tool-io-manifest.json')
  const map = new Map<string, { inputs: Set<string>; outputs: Set<string> }>()
  for (const [id, tool] of listTools()) {
    void tool
    // A runtime-generated tool's in-memory override is the AUTHORITATIVE raw-IO
    // (io_source 'run') — it wins over the on-disk manifest (which never lists it).
    const r = _dynamicIoOverride.get(id) ?? rawDisk[id]
    const m = merged[id]
    const outputs = (r?.output_keys && r.output_keys.length > 0) ? r.output_keys : (m?.output_keys ?? [])

    // INPUT AUTHORITY (2026-06-14, catalogue-de-pollution fix):
    // When the tool was harvested by RUNNING its python (`io_source === 'run'`),
    // its raw `input_keys` are the COMPLETE, authoritative set of fields the
    // executing code actually reads (every `payload.get(...)`). The MERGED
    // manifest's input_keys are a UNION of hand-plan contract reads across EVERY
    // class that ever routed through this tool id — so for a shared tool id it
    // CARRIES FOREIGN-CLASS FIELD NAMES the running tool silently ignores
    // (e.g. water-treatment-ro:sizing gains `water_recovery_pct` /
    // `dialysate_flow_rate_ml_per_min` from the dialysis-machine hand plan;
    // hvac:load-sizing gains `canopy_area_m2` / `led_installed_power_kw` /
    // `rated_spindle_power_kw` from the VF/CNC hand plans). Unioning those let the
    // generator wire a param the tool DROPS → it silently falls back to a wrong
    // default (RAS RO wired `water_recovery_pct=99.6`, tool read its own
    // `recovery_target_pct` default 70 → 70% make-up). So for a run-harvested
    // tool, the raw input set is AUTHORITATIVE — do NOT pollute it with the
    // cross-class merged union. This is the H1 "validate against the tool's REAL
    // runtime schema" principle applied to INPUTS, and it makes V2a reject a
    // foreign-class field name so the LLM must wire a field the tool truly reads.
    const runHarvested = r?.io_source === 'run' && Array.isArray(r.input_keys)
    const inputs = runHarvested
      ? new Set<string>(r!.input_keys)
      : new Set<string>([...(r?.input_keys ?? []), ...(m?.input_keys ?? [])])
    // ALWAYS union the live TS-source-parsed `input.<field>` reads (2026-06-14).
    // tsInputFieldsFor returns ∅ for any tool whose id literal isn't found in a
    // tools/*.ts file (e.g. python-wrapped tools), so this is a SUPERSET-safe
    // no-op for them. For pure-TS tools it closes the manifest-staleness gap: a
    // newly-added TS input field (e.g. mass-aggregator's `component_masses_kg`)
    // is picked up WITHOUT regenerating tool-io-raw.json. V2 only rejects a
    // param present in NEITHER source, so a superset never false-accepts a
    // hallucinated field that the tool can't read. (A run-harvested python tool
    // has no matching tools/*.ts `input.<field>` reads — the wrapper passes the
    // payload straight through — so this adds nothing for them, preserving the
    // authoritative raw set above.)
    for (const f of tsInputFieldsFor(id)) inputs.add(f)
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

/**
 * Unit family inferred from a tool OUTPUT FIELD NAME, for the V2c dimensional-
 * mismatch guard. Unlike `unitFamilyFromName` (which only reads a TERMINAL unit
 * token, for the auto-wire param matcher), this scans the WHOLE name for an
 * embedded unit token so `biomass_final_kg_total` resolves to `mass` (the `_total`
 * suffix would hide the `kg` from a terminal-only match). FLOW families are
 * tested BEFORE their static counterparts so `production_t_yr` → massflow (not
 * mass) and `flow_m3_h` → volflow (not volume). Returns 'other' when no token is
 * found (the guard treats 'other' as indeterminate → never blocks). Vocabulary
 * matches `unitFamilyOf` so the two are directly comparable.
 */
function fieldNameUnitFamily(name: string): string {
  const n = name.toLowerCase()
  // flow first (a flow token contains a mass/volume token)
  if (/(kg_h|kg_day|kg_s|kg_yr|t_yr|t_day|t_h|tpy|tph)(_|$)/.test(n)) return 'massflow'
  if (/(m3_h|m3h|m3_s|l_h|lph|l_s|l_min|lpm|l_day|l_per_day)(_|$)/.test(n)) return 'volflow'
  if (/(kwh|mwh|gwh|wh)(_|$)/.test(n)) return 'energy'
  if (/(kw|mw|gw)(_|$)/.test(n)) return 'power'
  if (/(kva|mva)(_|$)/.test(n)) return 'power'
  if (/(kg|tonne|tonnes)(_|$)/.test(n) || /biomass_kg/.test(n)) return 'mass'
  if (/(m3|litre|litres)(_|$)/.test(n)) return 'volume'
  if (/(m2)(_|$)/.test(n)) return 'area'
  if (/(gbp|usd|eur)(_|$)/.test(n) || /(cost|capex|opex|npv|price)/.test(n)) return 'currency'
  if (/(pct|percent)(_|$)/.test(n)) return 'dimensionless'
  if (/(deg_?c|temp_c)(_|$)/.test(n)) return 'temperature'
  if (/(_v|kv)(_|$)/.test(n) || /voltage/.test(n)) return 'voltage'
  if (/(_a|ka|ma)(_|$)/.test(n)) return 'current'
  if (/(pa|kpa|bar|barg|mpa)(_|$)/.test(n)) return 'pressure'
  if (/(ppt|ppm|mg_l|g_l)(_|$)/.test(n)) return 'concentration'
  return 'other'
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
    // CAPABILITY EXCEPTION (2026-06-14): a tool that declares the universal
    // `component_masses_kg` input opts INTO generic component-mass summing — its
    // invoke() adds ANY `*_mass_kg`/`*_mass_g` input to the total (see
    // mass-aggregator.ts). So for such a tool, accept a mass-named param even if
    // it isn't in the explicit (grab-bag, class-harvested) input list. This is
    // capability-driven, NOT a per-class table: it lets the generator wire each
    // principal-equipment mass into the mass producer by a meaningful name.
    const acceptsGenericMass = realInputs.has('component_masses_kg')
    const rawInputs: any[] = Array.isArray(s?.inputs) ? s.inputs : []
    const inputs: ToolPlanInputSpec[] = []
    for (const [j, inp] of rawInputs.entries()) {
      const param = typeof inp?.param === 'string' ? inp.param.trim() : ''
      if (!param) { errors.push(`step[${i}] "${toolId}" inputs[${j}] param missing`); continue }
      // Same suffix set mass-aggregator.ts sums (incl. biomass_kg, e.g.
      // standing_biomass_kg) so an injected/wired mass param re-validates on reuse.
      const isGenericMassParam = acceptsGenericMass && /(_mass_(kg|g)|biomass_kg)$/.test(param)
      if (realInputs.size > 0 && !realInputs.has(param) && !isGenericMassParam) {
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
      // V2c — DIMENSIONAL CONSISTENCY of the declared output unit vs the tool
      // field it reads (2026-06-14). The renderer/headline displays the tool's
      // raw numeric value with the LLM-DECLARED `unit` string — so a wrong unit
      // SILENTLY MIS-SCALES the number by orders of magnitude even though the
      // field is real and the value is computed. RAS monod mapped
      // `biomass_final_kg_total` (a standing-biomass MASS in kg) to a
      // `production_capacity_tpy` output declared `unit:"t/yr"` (a mass-FLOW): the
      // 24,716 kg standing biomass rendered as "24,716 t/yr" (≈121× the 204 t/yr
      // brief — a kg↦t/yr family swap). GUARD: when BOTH the tool field NAME's
      // unit family AND the declared unit's family are DETERMINATE (neither
      // 'other'/'dimensionless'/unknown) and they DISAGREE, reject — the LLM is
      // relabelling the quantity across dimensions. Conservative on purpose:
      // an 'other'/unknown on either side (e.g. `velocity_m_s`, `kla_per_hour`)
      // never blocks, so only a true cross-family mislabel trips. Universal — it
      // reads the field-name suffix + the unit string, no per-class table.
      const fieldFam = fieldNameUnitFamily(toolField)
      const declUnitFam = unitFamilyOf(typeof o?.unit === 'string' ? o.unit : '')
      const determinate = (f: string) => f !== 'other' && f !== 'dimensionless' && f !== ''
      if (determinate(fieldFam) && determinate(declUnitFam) && fieldFam !== declUnitFam) {
        errors.push(
          `step[${i}] "${toolId}" outputs[${j}] DIMENSIONAL MISMATCH: tool field "${toolField}" is a ${fieldFam} quantity ` +
          `but you declared unit "${o?.unit}" (${declUnitFam}). The renderer prints the tool's value with YOUR unit, so this ` +
          `mis-scales the number across dimensions. Either declare a ${fieldFam} unit, or — if you need a ${declUnitFam} quantity ` +
          `(e.g. annual production t/yr vs standing biomass kg) — that tool field does NOT compute it: wire from a contract key ` +
          `that already carries the ${declUnitFam} value, or pick a tool whose output field is genuinely ${declUnitFam} (V2c)`,
        )
        continue
      }
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
  processText: string = '',
): string {
  const desc = String(brief.product_description ?? '').slice(0, 5000)

  const dutyLines = contractQuantities
    .slice(0, 120)
    .map(q => `- ${q.key} = ${q.value} ${q.unit}${q.condition ? ` (${q.condition})` : ''}`)
    .join('\n')

  // The SAME list, framed as the WIRABLE KEYS — every key here ALREADY EXISTS on
  // the engineering contract with a real value. A tool input that means one of
  // these quantities MUST be wired with from_contract_key to that key; it MUST
  // NOT be hard-coded as a constant. This is the heart of FIX A: the generator
  // wires from real available data instead of inventing literals.
  const wirableKeyList = contractQuantities
    .slice(0, 120)
    .map(q => `${q.key} (${q.value} ${q.unit})`)
    .join(', ')

  // Annotate each OUTPUT field with the DIMENSION its name implies (kg = mass,
  // t/yr = mass-flow, kW = power, % = ratio, …). The generator must declare an
  // output `unit` in THAT dimension — the V2c guard rejects a cross-dimension
  // relabel (e.g. tagging a `*_kg_total` mass as `t/yr`). Showing the dimension
  // inline stops the mislabel at authoring time instead of via a repair round.
  const annotateOut = (f: string): string => {
    const fam = fieldNameUnitFamily(f)
    return fam === 'other' ? f : `${f} [${fam}]`
  }
  const catalogueLines = catalogue
    .map(c =>
      `- ${c.tool_id} [${c.domain}] ${c.description}\n` +
      `    inputs: ${c.input_fields.join(', ') || '(none)'}\n` +
      `    outputs: ${c.output_fields.map(annotateOut).join(', ') || '(none)'}`,
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
    (processText
      ? `STATED PROCESS (the named unit operations the plant MUST contain — EVERY unit named here needs a sizing tool in your plan; the catalogue below has been pre-filtered to the tools relevant to THIS plant):\n${processText.slice(0, 4000)}\n\n`
      : '') +
    (dutyLines
      ? `ENGINEERING DUTIES THE SYSTEM MUST PERFORM (the parsed engineering-contract quantities — pick tools that COMPUTE or CONSUME these):\n${dutyLines}\n\n`
      : '') +
    (wirableKeyList
      ? `AVAILABLE CONTRACT KEYS — these quantities ALREADY EXIST on the engineering contract with real values. Whenever a tool input MEANS the same quantity as one of these, you MUST wire it: set from_contract_key to that EXACT key. Do NOT hard-code a constant for a value that exists here. (key (value unit), …):\n${wirableKeyList}\n\n`
      : '') +
    (briefMetricKeys.length > 0
      ? `BRIEF TARGET METRIC KEYS (your plan must produce these as contract_key, OR they are already supplied above):\n- ${briefMetricKeys.join('\n- ')}\n\n`
      : '') +
    `TOOL CATALOGUE (the ONLY tools you may use; the inputs/outputs are the ONLY field names you may wire — any other name is REJECTED). Each tool's "outputs" are contract_keys you can WRITE and then FEED into a LATER tool's input via from_contract_key — chain tools into a connected graph, do not leave a flat list of isolated calcs:\n${catalogueLines}\n\n` +
    (fewShots ? `${fewShots}\n\n` : '') +
    `WIRING IS THE WHOLE JOB. For EVERY input, choose its source in THIS PRIORITY ORDER:\n` +
    `  (a) an AVAILABLE CONTRACT KEY above whose meaning matches → from_contract_key = that key;\n` +
    `  (b) the OUTPUT (contract_key) of ANOTHER tool you selected, when the value is computed upstream → from_contract_key = that upstream output's contract_key (this is how you build the DAG: pick output names that downstream tools then read);\n` +
    `  (c) ONLY if the value exists NEITHER in (a) NOR (b): a literal constant — and ONLY for a genuine physical assumption/coefficient (e.g. a de-rating factor, a power factor, a material density), NEVER for a duty/scale quantity that the contract already carries.\n` +
    `A constant where a contract key existed is a WIRING FAILURE. Aim: most inputs wired from (a)/(b); few constants; tools chained so outputs feed downstream inputs.\n\n` +
    `OUTPUT RULES (validated DETERMINISTICALLY — violations are rejected):\n` +
    `1. COVERAGE IS COMPREHENSIVE — the failure mode is UNDER-selection. Select a tool for EVERY engineering duty listed above AND for EVERY principal equipment item the plant must have designed: each PUMP, each VESSEL/TANK, each FILTER/SEPARATOR, each REACTOR/biological stage, each HEAT-exchange/heat-pump/thermal duty, each GAS-TRANSFER/degasser/aeration stage, each DISINFECTION/UV stage — PLUS the full ELECTRICAL distribution chain (cable/ampacity sizing, transformer sizing, the load/feeder schedule) and the control/instrumentation. Use as many tools as the job genuinely needs — there is NO upper cap; a complex multi-subsystem plant routinely needs 30, 60, 100+ tools, one per duty + per equipment item + per electrical feeder + per control loop. A handful is WRONG; UNDER-selection is the only failure mode here. Every duty above MUST be CONSUMED by at least one tool that SIZES the equipment meeting it (an oxygen-demand duty → a dissolved-oxygen/aeration sizing tool; a heating duty → a heat-pump/heat-loss tool; an electrical load → cable + transformer + load-schedule tools; a flow duty → a pump/pipe sizing tool). Do NOT minimise the set. Each tool_id MUST be one from the catalogue. PREFER tools whose inputs you can WIRE from the AVAILABLE CONTRACT KEYS (which now INCLUDE the brief's quantified duties) or an upstream tool's output, over tools that would force many hard-coded constants.\n` +
    `2. For each step, wire inputs[].param to a REAL input field of that tool, sourced per the WIRING priority above. For a from_contract_key input add a numeric fallback. For a constant input give the literal in "constant".\n` +
    `3. For each step, wire outputs[]: contract_key is the NEW quantity name you write (CHOOSE a clear name a downstream tool can read by from_contract_key); tool_output_field MUST be a REAL output field of that tool (exactly as spelled in the catalogue). Give unit + family.\n` +
    `3a. DIMENSION DISCIPLINE (validated — a cross-dimension relabel is REJECTED). The catalogue tags each output field with the DIMENSION its name implies, e.g. "biomass_final_kg_total [mass]", "permeate_flow_m3_h [volflow]", "recovery_pct [dimensionless]". The "unit" you declare MUST be in that SAME dimension. NEVER relabel a quantity into a different dimension to make it "look like" a metric you want. Worked examples of the trap: a "*_kg_total" field is a STANDING MASS in kg — it is NOT annual production in t/yr (a mass-FLOW); a membrane "recovery_pct" (fraction of feed that becomes permeate) is NOT a make-up-water percentage; a "required_chiller_capacity_kw" is a COOLING duty, NOT a heating duty. If the brief needs a quantity in a dimension/meaning the available tool fields do NOT compute, prefer to ECHO the matching AVAILABLE CONTRACT KEY (rule 3b) rather than force-fit a wrong field.\n` +
    `3b. ALREADY-SUPPLIED METRICS — do NOT recompute a brief metric via a mismatched tool field when the AVAILABLE CONTRACT KEYS already carry it. The contract keys above are authoritative engineering values. If the brief target (e.g. annual production, make-up-water rate, building heating duty) is already an available contract key, you do NOT need a tool to produce it — it is satisfied by the contract. Only add a tool output for a quantity the contract does NOT already supply, and only with a tool field that genuinely computes THAT quantity in THAT dimension.\n` +
    `3c. PICK THE DOMAIN-CORRECT TOOL FOR THE DUTY. Match the tool's PHYSICS to the duty, not just an output-key name. Heating duty → a heat-pump/heating tool (a "cop_heating"/"heating_capacity_kw"/"recommended_heat_pump_kw"/"design_heat_loss_kw" output), NEVER a cooling-chiller tool's "required_chiller_capacity_kw". Cooling duty → the chiller/HVAC cooling tool. A recirculating-system make-up rate is a tiny top-up (make-up flow ÷ recirculation flow), not a reverse-osmosis recovery fraction. A standing inventory is a MASS; an annual throughput is a mass-FLOW — different tools, different fields.\n` +
    `4. You MUST include the tool "${UNIVERSAL_MASS_PRODUCER}" and wire its "${UNIVERSAL_MASS_KEY}" output field to a contract_key "${UNIVERSAL_MASS_KEY}" (the whole-system mass + envelope check every design needs). FEED IT the principal-equipment masses: give it ONE "*_mass_kg" input per major component (e.g. the tanks, the filtration vessels, the pumps/skids, the electrical gear), each wired with from_contract_key from an upstream sizing tool's mass output OR an available contract mass key — every "*_mass_kg" input you give is summed. Wire AS MANY component masses as you have sources for (≥2 where possible); do NOT leave it with no mass inputs (its total would be 0). Do NOT wire its OWN total back into it — never feed "total_system_mass_kg" or any "total_*_mass_kg" as an INPUT (that is the value it COMPUTES, not a component). Also wire its "max_mass_kg_envelope" input from the brief's mass cap if one exists.\n` +
    `5. You MUST produce at least one cost/capex key (wire a cost-bearing tool output, e.g. regulatory-cert-cost:lookup → total_cost_gbp, or a tool's estimated_capex_gbp).\n` +
    `6. Do NOT worry about run ORDER — it is computed deterministically from your wiring. Wire data dependencies via matching contract_key → from_contract_key across steps.\n` +
    (priorErrors.length > 0
      ? `\nYOUR PREVIOUS ATTEMPT FAILED DETERMINISTIC VALIDATION. Fix EVERY error (do NOT invent field names — use ONLY the catalogue's exact spellings):\n${priorErrors.map(e => `- ${e}`).join('\n')}\n` +
        (priorErrors.some(e => /DIMENSIONAL MISMATCH/.test(e))
          ? `\nHOW TO FIX A "DIMENSIONAL MISMATCH" (do this EXACTLY — do not oscillate): the output field's name implies a dimension (shown as a [tag] in the catalogue, e.g. "daily_feed_kg [mass]"). You MUST declare the "unit" in THAT SAME dimension — for a [mass] field declare a mass unit like "kg" (NOT "kg/day"); for a [massflow] field declare "kg/day" or "t/yr"; for a [power] field declare "kW". Do NOT relabel the field to the dimension you WISH it were. If you genuinely need a different-dimension quantity (e.g. a per-DAY rate but the field is a static mass), then either (a) drop that output and ECHO the matching AVAILABLE CONTRACT KEY instead, or (b) pick a DIFFERENT tool output field whose [tag] already matches the dimension you need. The fastest clean fix is almost always: declare the unit that matches the field's [tag].\n`
          : '')
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

/** Default harvest-call abort timeout (ms). The orchestrator may pass a LONGER
 *  one on a retry after a transient timeout (FIX 2a). */
const DEFAULT_HARVEST_TIMEOUT_MS = 180_000

/** Is a harvest error TRANSIENT (timeout / 5xx / transport drop / empty
 *  completion)? A transient failure is retried WITHOUT consuming a validation
 *  attempt. A genuine validation/parse error is NOT transient (it is the model's
 *  answer, just wrong) and proceeds through the normal error-feedback loop. The
 *  empty-completion case (`finish_reason=?`) is treated transient: it is an
 *  OpenRouter hiccup, not a considered answer. */
function isTransientHarvestError(error: string): boolean {
  const e = (error || '').toLowerCase()
  return (
    e.includes('timeout') || e.includes('aborted') ||
    e.includes('http 5') ||
    e.includes('econnreset') || e.includes('socket hang up') ||
    e.includes('network') || e.includes('fetch failed') || e.includes('etimedout') ||
    e.includes('empty completion')
  )
}

async function harvestPlanViaLLM(prompt: string, timeoutMs: number = DEFAULT_HARVEST_TIMEOUT_MS): Promise<HarvestOutcome> {
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
      signal: AbortSignal.timeout(timeoutMs),
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

// ── (c.5) DETERMINISTIC AUTO-WIRE — close the wire-vs-constant gap ──────────
//
// FIX A floor (2026-06-14): the LLM is INSTRUCTED to wire from available
// contract keys / upstream outputs, but at temp 0 it still hard-codes some
// inputs as constants run-to-run (variance). This PURE, deterministic pass
// enforces the floor: for every `constant` input, if a HIGH-CONFIDENCE
// same-quantity source exists (an available contract key OR a contract_key an
// upstream step writes), rewrite the input to wire from it (keeping the LLM's
// literal as the numeric fallback). High precision — it only rewrites when the
// match is unambiguous, so it never INVENTS a wrong wire; a genuine physical
// coefficient (a de-rating factor, an efficiency, a material string) is left as
// a constant. NOT a per-class table: matching is by quantity NAME + UNIT FAMILY
// against whatever keys this run actually carries.

/** Canonical unit family for a unit string (coarse — enough to gate a wire). */
function unitFamilyOf(unit: string): string {
  const u = unit.trim().toLowerCase()
  if (!u || u === '-' || u === 'dimensionless') return 'dimensionless'
  if (/^(kw|w|mw|gw|kwe|kwth)$/.test(u)) return 'power'
  if (/^(kwh|wh|mwh|gwh|j|kj|mj|gj)$/.test(u)) return 'energy'
  if (/(m3\/h|m³\/h|l\/h|l\/s|l\/min|lpm|m3\/s|m³\/s)/.test(u)) return 'volflow'
  if (/(kg\/h|kg\/day|kg\/s|t\/h|t\/day|t\/yr|tpy|kg\/yr)/.test(u)) return 'massflow'
  if (/^(kg|g|t|tonne|tonnes|kg\b)$/.test(u)) return 'mass'
  if (/^(m3|m³|l|litre|litres|m3\b)$/.test(u)) return 'volume'
  if (/^(m2|m²|m2\b)$/.test(u)) return 'area'
  if (/^(m|mm|cm|km)$/.test(u)) return 'length'
  if (/^(°c|c|k|degc|deg_c|celsius)$/.test(u)) return 'temperature'
  if (/^(v|kv|mv)$/.test(u)) return 'voltage'
  if (/^(a|ka|ma)$/.test(u)) return 'current'
  if (/^(gbp|usd|eur|£|\$|€)$/.test(u)) return 'currency'
  if (/^(ppt|ppm|mg\/l|g\/l)$/.test(u)) return 'concentration'
  if (/^(pa|kpa|bar|barg|mpa)$/.test(u)) return 'pressure'
  return 'other'
}

/** Family inferred from a PARAM/KEY NAME's trailing unit token (when the source
 *  has no declared unit, e.g. an upstream contract_key the LLM named). */
function unitFamilyFromName(name: string): string {
  const n = name.toLowerCase()
  if (/_(kw|mw|w)$/.test(n)) return 'power'
  if (/_(kwh|mwh|wh|gj|mj|kj)(_|$)/.test(n)) return 'energy'
  if (/_(m3_h|m3h|lpm|l_day|l_per_day|m3_s)$/.test(n)) return 'volflow'
  if (/_(kg_h|kg_day|kg_s|t_yr|tpy|kg_yr|t_day)$/.test(n)) return 'massflow'
  if (/_(kg|g|t|tonne|tonnes)$/.test(n)) return 'mass'
  if (/_(m3|l|litres?)$/.test(n)) return 'volume'
  if (/_(m2)$/.test(n)) return 'area'
  if (/_(mm|cm|km|_m)$/.test(n) || /_m$/.test(n)) return 'length'
  if (/_(c|degc|temp_c)$/.test(n) || /temp/.test(n)) return 'temperature'
  if (/_(v|kv)$/.test(n) || /voltage/.test(n)) return 'voltage'
  if (/_(a|ka|ma)$/.test(n) || /current/.test(n)) return 'current'
  if (/_(gbp|usd|eur)$/.test(n) || /(cost|capex|price|opex|npv)/.test(n)) return 'currency'
  if (/_(ppt|ppm|mg_l|g_l)$/.test(n)) return 'concentration'
  if (/_(pa|kpa|bar|barg|mpa)$/.test(n)) return 'pressure'
  return 'other'
}

// Mass-NAMED contract keys that are NOT a single component to sum (totals,
// caps, envelopes). Mirrors mass-aggregator.ts's NON_COMPONENT_MASS_KEYS so the
// mass-producer completion never injects a pre-summed total or a cap as a
// component (which would double-count or corrupt the sum).
const MASS_NON_COMPONENT_KEYS = new Set<string>([
  'max_mass_kg_envelope', 'max_mass_kg', 'brief_mass_cap_kg', 'road_transport_limit_kg',
  'total_mass_kg', 'total_system_mass_kg', 'total_estimated_mass_kg',
  'system_mass_with_external_kg', 'in_container_mass_kg',
])

// Trailing unit tokens stripped to compare the DISTINCTIVE name tokens.
const UNIT_TOKENS = new Set<string>([
  'kw', 'mw', 'w', 'kwh', 'mwh', 'wh', 'gj', 'mj', 'kj', 'kg', 'g', 't', 'tonne', 'tonnes',
  'm3', 'm2', 'm', 'mm', 'cm', 'km', 'l', 'litre', 'litres', 'lpm', 'h', 'hr', 'hour', 's',
  'day', 'yr', 'year', 'pct', 'percent', 'c', 'degc', 'k', 'v', 'kv', 'mv', 'a', 'ka', 'ma',
  'gbp', 'usd', 'eur', 'ppt', 'ppm', 'pa', 'kpa', 'bar', 'barg', 'mpa', 'per', 'each',
])

// Param-name tokens that mark a DIMENSIONLESS physical coefficient/assumption —
// these are genuine constants and must NEVER be auto-wired (the false-match
// guard that stopped `power_factor`→`recirc_pump_power_kw`).
const COEFFICIENT_TOKENS = new Set<string>([
  'factor', 'efficiency', 'fraction', 'ratio', 'coefficient', 'derate', 'derating',
  'headroom', 'setpoint', 'margin', 'tolerance', 'conversion', 'utilisation',
])

function distinctiveTokens(name: string): string[] {
  return name.toLowerCase().split(/[_\s]+/).filter(t => t.length >= 3 && !UNIT_TOKENS.has(t))
}

/**
 * Find a high-confidence contract-key source for a tool input `param`, given the
 * set of candidate keys (available contract keys + upstream-produced keys), each
 * with a known unit (or '' when unknown). Returns the key, or null.
 *
 * MATCH (precise): the param's distinctive tokens are a NON-EMPTY SUBSET of the
 * key's distinctive tokens (so `inlet_water_temp_c` matches `water_setpoint_temp_c`
 * only if {water,temp}⊆{water,setpoint,temp} — yes; `power_factor` won't match
 * `recirc_pump_power_kw` because {power,factor}⊄{recirc,pump,power}), AND the
 * unit families are compatible (same family, or one side dimensionless/unknown).
 * Among ties, the key with the FEWEST extra tokens (closest) wins; deterministic.
 */
function findContractKeyForParam(
  param: string,
  candidates: ReadonlyArray<{ key: string; unitFamily: string }>,
): string | null {
  const pTokens = distinctiveTokens(param)
  if (pTokens.length === 0) return null
  // Never auto-wire a dimensionless physical coefficient/assumption.
  if (pTokens.some(t => COEFFICIENT_TOKENS.has(t))) return null
  const pFam = unitFamilyFromName(param)
  const pSet = new Set(pTokens)

  let best: { key: string; extra: number } | null = null
  for (const c of candidates) {
    const kTokens = distinctiveTokens(c.key)
    if (kTokens.length === 0) continue
    const kSet = new Set(kTokens)
    // param tokens ⊆ key tokens (every distinctive param token present in key)
    if (!pTokens.every(t => kSet.has(t))) continue
    // unit-family compatibility: same family, or either side dimensionless/other/unknown
    const kFam = c.unitFamily || unitFamilyFromName(c.key)
    const famOk =
      pFam === kFam ||
      pFam === 'dimensionless' || pFam === 'other' ||
      kFam === 'dimensionless' || kFam === 'other' || kFam === ''
    if (!famOk) continue
    const extra = kSet.size - pSet.size
    if (!best || extra < best.extra || (extra === best.extra && c.key < best.key)) {
      best = { key: c.key, extra }
    }
  }
  return best?.key ?? null
}

export interface AutoWireResult {
  spec: ToolPlanSpec
  rewired: Array<{ tool_id: string; param: string; from_contract_key: string; was_constant: unknown }>
}

/**
 * Deterministically rewrite `constant` inputs → `from_contract_key` wherever a
 * high-confidence same-quantity source exists. `contractKeyUnits` are the
 * available contract keys (key + unit). Upstream-produced contract_keys (a step
 * earlier in the spec wrote them) are ALSO candidates, so this also raises
 * cross-tool CONNECTIONS, not just brief-key wiring. Pure; preserves the LLM's
 * literal as the numeric `fallback`. Returns the new spec + a rewire log.
 */
export function autoWireSpecInputs(
  spec: ToolPlanSpec,
  contractKeyUnits: ReadonlyArray<{ key: string; unit: string }>,
): AutoWireResult {
  const rewired: AutoWireResult['rewired'] = []
  const availCandidates = contractKeyUnits.map(c => ({ key: c.key, unitFamily: unitFamilyOf(c.unit) }))
  const io = buildToolIoMap()

  // Available + upstream COMPONENT-MASS keys (a real component's kg) that should
  // be summed by the universal mass producer. Excludes totals/caps/envelopes so
  // we never double-count a pre-summed figure. A key counts if it ends in a
  // component-mass suffix and is not a NON_COMPONENT mass key.
  const isComponentMassKey = (k: string): boolean => {
    const kl = k.toLowerCase()
    if (MASS_NON_COMPONENT_KEYS.has(kl)) return false
    // Mirror mass-aggregator.ts isGenericComponentMassKey (exclude _weight_kg —
    // usually a per-unit weight, not a system mass).
    return /(_mass_kg|biomass_kg)$/.test(kl)
  }
  const availMassKeys = contractKeyUnits.map(c => c.key).filter(isComponentMassKey)

  // Keys produced by steps BEFORE the current one (built as we sweep in order).
  const upstreamProduced: Array<{ key: string; unitFamily: string }> = []

  const newSteps: ToolPlanStepSpec[] = spec.steps.map(step => {
    const candidates = [...availCandidates, ...upstreamProduced]
    const newInputs = step.inputs.map(inp => {
      // Only rewrite a genuine constant (no existing wire) with a NUMERIC literal
      // (a string/bool constant is a mode/material/name, never a wirable quantity).
      if (inp.from_contract_key || typeof inp.constant !== 'number') return inp
      const key = findContractKeyForParam(inp.param, candidates)
      if (!key) return inp
      rewired.push({ tool_id: step.tool_id, param: inp.param, from_contract_key: key, was_constant: inp.constant })
      return {
        param: inp.param,
        from_contract_key: key,
        // keep the LLM's literal as the fallback so an absent key still computes
        fallback: typeof inp.constant === 'number' ? inp.constant : inp.fallback,
      } as ToolPlanInputSpec
    })

    // MASS-PRODUCER COMPLETION (2026-06-14): for a tool that opts into generic
    // component-mass summing (declares `component_masses_kg`), GUARANTEE the
    // dominant masses are summed by injecting every available + upstream
    // component-mass key not already wired as a `<key>` input. This stops the
    // headline mass collapsing to a couple of small LLM-guessed buckets (e.g. a
    // RAS farm whose 200 t biomass + sized tanks were omitted → 4 t total). The
    // cost stack reads this mass, so under-counting craters the £/output. Each
    // wired here is summed by mass-aggregator's universal path (FIX B); a `kg`
    // input is passed through, a `g` suffix is the tool's own /1000.
    if (io.get(step.tool_id)?.inputs.has('component_masses_kg')) {
      const alreadyWired = new Set(
        newInputs.map(i => i.from_contract_key).filter(Boolean) as string[],
      )
      // upstream component-mass outputs (a sizing tool that wrote a *_mass_kg)
      const upstreamMassKeys = upstreamProduced.map(u => u.key).filter(isComponentMassKey)
      const massKeysToAdd = [...new Set([...availMassKeys, ...upstreamMassKeys])]
        .filter(k => !alreadyWired.has(k))
      for (const k of massKeysToAdd) {
        // param name = the contract key itself (a real *_mass_kg name → accepted
        // by the generic-mass V2 exception + summed by the tool).
        newInputs.push({ param: k, from_contract_key: k, fallback: 0 })
        rewired.push({ tool_id: step.tool_id, param: k, from_contract_key: k, was_constant: '(injected component mass)' })
      }
    }

    // Now this step's OUTPUT contract_keys become upstream candidates for later steps.
    for (const o of step.outputs) {
      upstreamProduced.push({ key: o.contract_key, unitFamily: unitFamilyOf(o.unit) })
    }
    return { ...step, inputs: newInputs }
  })

  return { spec: { ...spec, steps: newSteps }, rewired }
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

/** Extract the brief's STATED PROCESS text (the named unit operations). The brief
 *  may be flattened (chain spreads constraints up) OR nested — read both. The
 *  field is `{value: string|null, source}` in StructuredBriefJSON; also tolerate a
 *  bare string. Returns '' when absent. Used by the relevance sweep + coverage
 *  gate to key off the brief-named units. */
function targetProcessText(brief: ParsedConstraints): string {
  const b = brief as any
  const c = (b?.constraints ?? {}) as any
  const pick = (tp: any): string =>
    typeof tp === 'string' ? tp : (tp && typeof tp.value === 'string' ? tp.value : '')
  return (pick(b?.target_process) || pick(c?.target_process) || '').trim()
}

/** A FULLER brief text for the COVERAGE GATE's named-unit detection only (NOT the
 *  relevance cache key — this never affects determinism). The parsed `target_process`
 *  is often condensed by the brief parser (it dropped the heat-pump/electrical/
 *  control mentions on the RAS brief), so the gate must also scan the
 *  product_description, mission_statement, and the additional_constraints +
 *  derived_requirement labels where those named units actually surface. Read both
 *  the flattened (chain-spread) and nested shapes. */
function coverageText(brief: ParsedConstraints): string {
  const b = brief as any
  const c = (b?.constraints ?? {}) as any
  const parts: string[] = [
    String(b?.product_description ?? ''),
    targetProcessText(brief),
    String(b?.mission_statement ?? ''),
    String(b?.why_now ?? ''),
  ]
  const addl = [
    ...(Array.isArray(c?.additional_constraints) ? c.additional_constraints : []),
    ...(Array.isArray(b?.additional_constraints) ? b.additional_constraints : []),
  ]
  for (const a of addl) parts.push(typeof a === 'string' ? a : String(a?.description ?? ''))
  const dreqs = [
    ...(Array.isArray(c?.derived_requirements) ? c.derived_requirements : []),
    ...(Array.isArray(b?.derived_requirements) ? b.derived_requirements : []),
  ]
  for (const r of dreqs) parts.push(`${String(r?.label ?? '')} ${String(r?.key ?? '')}`)
  return parts.filter(Boolean).join('\n')
}

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

/** Brief metrics WITH their value + unit (the same source as briefMetricKeysFrom,
 *  but retaining value/unit so the caller can resolve which are already supplied
 *  by an authoritative contract quantity under a different KEY NAME). */
function briefMetricsFrom(brief: ParsedConstraints): Array<{ key: string; value: number | null; unit: string }> {
  const seen = new Set<string>()
  const out: Array<{ key: string; value: number | null; unit: string }> = []
  const extra = (brief as any)?.extra ?? brief
  const constraints = (extra?.constraints ?? (brief as any)?.constraints) as any
  const tp = constraints?.target_performance ?? (brief as any)?.target_performance
  const push = (k: unknown, v: unknown, u: unknown) => {
    if (typeof k !== 'string' || !/^[a-z0-9_]+$/.test(k) || seen.has(k)) return
    seen.add(k)
    out.push({ key: k, value: typeof v === 'number' && Number.isFinite(v) ? v : null, unit: typeof u === 'string' ? u : '' })
  }
  if (tp) {
    push(tp.key_metric, tp.value, tp.unit)
    if (Array.isArray(tp.metrics)) for (const mm of tp.metrics) push(mm?.key_metric, mm?.value, mm?.unit)
  }
  return out
}

/**
 * Resolve which brief metrics are ALREADY satisfied by an authoritative contract
 * quantity carried under a DIFFERENT key name. The parsed-brief metric keys are
 * the user's names (e.g. `production_capacity_tpy`, `water_recirculation_rate_percent`),
 * which often differ from the engineering-contract's computed keys (e.g.
 * `annual_production_t_yr`, `recirc_fraction_recycled`). When they NAME-mismatch,
 * the V3 coverage gate would otherwise FORCE the generator to produce the metric
 * via SOME tool field — and the only field that "fits" is frequently a WRONG-
 * dimension stand-in (RAS forced monod's standing-biomass kg into a `t/yr`
 * production slot, and RO's recovery-% into a recirculation-rate slot — the exact
 * grossly-wrong numbers this fix prevents). A brief metric counts as supplied if
 * a contract quantity matches by (a) coarse NAME overlap, OR (b) compatible UNIT
 * FAMILY *and* VALUE within 2% (same physical quantity, renamed). Returns the
 * supplying contract keys (to add to contractSuppliedKeys so coverage passes) and
 * the brief keys deemed satisfied (to drop from the REQUIRED metric set). Pure.
 */
function briefMetricsSatisfiedByContract(
  briefMetrics: ReadonlyArray<{ key: string; value: number | null; unit: string }>,
  contractQuantities: ReadonlyArray<{ key: string; value: number; unit: string }>,
): { satisfiedBriefKeys: Set<string>; supplyingContractKeys: Set<string> } {
  const satisfiedBriefKeys = new Set<string>()
  const supplyingContractKeys = new Set<string>()
  for (const bm of briefMetrics) {
    const bmFam = unitFamilyOf(bm.unit) // declared brief unit family
    for (const cq of contractQuantities) {
      // Name match, stem-tolerant: keyCoarseMatch is exact-token, so a plural/
      // qualifier difference (`turnovers_per_hour` vs `water_turnover_rate_per_hour`)
      // misses. Retry on singularised tokens so the same physical quantity under a
      // renamed key still resolves (no per-class synonym table).
      const stem = (k: string) => k.toLowerCase().replace(/s(_|$)/g, '$1')
      const nameMatch = keyCoarseMatch(cq.key, bm.key) || keyCoarseMatch(stem(cq.key), stem(bm.key))
      let valueMatch = false
      if (!nameMatch && bm.value != null && Number.isFinite(cq.value)) {
        const cqFam = unitFamilyOf(cq.unit)
        const famOk = bmFam !== 'other' && bmFam !== '' && (bmFam === cqFam ||
          // a fraction (0.996) and a percent (99.6) are the same quantity ×100
          (bmFam === 'dimensionless' && cqFam === 'dimensionless'))
        if (famOk) {
          const a = Math.abs(bm.value)
          const b = Math.abs(cq.value)
          const within = (x: number, y: number) => y !== 0 && Math.abs(x - y) / Math.abs(y) <= 0.02
          // direct, or fraction↔percent (×100) for dimensionless ratios
          valueMatch = within(a, b) ||
            (bmFam === 'dimensionless' && (within(a, b * 100) || within(a * 100, b)))
        }
      }
      if (nameMatch || valueMatch) {
        satisfiedBriefKeys.add(bm.key)
        supplyingContractKeys.add(cq.key)
      }
    }
  }
  return { satisfiedBriefKeys, supplyingContractKeys }
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
  opts: { harvestTimeoutMs?: number } = {},
): Promise<ToolPlanBootstrapResult> {
  // Normalise hyphens (genericEnvelope hyphenates non-minted novel slugs) to the
  // candidate-store alphabet, then validate at the boundary.
  const slug = String(rawSlug ?? '').trim().toLowerCase().replace(/-/g, '_')
  if (!SLUG_RE.test(slug)) {
    return { ok: false, slug, attempts: 0, stage: 'invalid-slug', validation_errors: [], error: `slug "${rawSlug}" does not sanitise to /^[a-z0-9_]{1,64}$/` }
  }

  // Brief metric keys, MINUS the ones an authoritative contract quantity already
  // supplies under a different name (value+family match) — see
  // briefMetricsSatisfiedByContract. Dropping the satisfied keys from the REQUIRED
  // set stops the V3 coverage gate forcing the generator to recompute an
  // already-known metric via a wrong-dimension tool field (the RAS monod-t/yr +
  // RO-recovery mislabels). The supplying contract keys are added to
  // contractSuppliedKeys so coverage still passes for any that slip through.
  const allBriefMetricKeys = briefMetricKeysFrom(brief)
  const { satisfiedBriefKeys, supplyingContractKeys } = briefMetricsSatisfiedByContract(
    briefMetricsFrom(brief),
    contractQuantities,
  )
  const briefMetricKeys = allBriefMetricKeys.filter(k => !satisfiedBriefKeys.has(k))
  const contractSuppliedKeys = [
    ...contractQuantities.map(q2 => q2.key),
    ...satisfiedBriefKeys, // the brief's own name, now treated as supplied
    ...supplyingContractKeys,
  ]

  // (0) DB-FIRST REUSE: a previously stored candidate makes re-runs free +
  // deterministic. Re-validate against the CURRENT registry (a registry change
  // that breaks the wiring → regenerate).
  //
  // DETERMINISM FIX (2026-06-14): re-validate STRUCTURALLY ONLY — pass EMPTY brief-
  // metric arrays, NOT the run-varying briefMetricKeys/contractSuppliedKeys. The
  // brief-metric coverage (V3) depends on the engineering-contract quantities,
  // which JITTER run-to-run (the brief-expansion + contract emission are not byte-
  // stable). Re-imposing the jittery metric set on reuse made a stored, perfectly-
  // good plan FAIL re-validation on the next run → re-harvest → a DIFFERENT plan
  // (the run1=60-tools vs run2=47-tools divergence). The brief-metric coverage was
  // already satisfied when the plan was STORED; on reuse we only need to confirm
  // the plan is still STRUCTURALLY valid (V1 tool ids exist, V2 every wired field
  // is real, V3 the UNIVERSAL mass+cost producers are present) — those are
  // properties of the PLAN, stable across runs. A genuine registry drift (a tool
  // removed / a field renamed) still fails V1/V2 → regenerate. This is what makes
  // reuse byte-deterministic: same stored plan → re-validates → reused identically.
  const prior = latestCandidate(slug)
  if (prior) {
    try {
      const v = validateToolPlanSpec(JSON.parse(prior.plan_json), [], [])
      if (v.ok && v.spec) {
        // Re-apply the deterministic auto-wire (idempotent) so a candidate stored
        // before auto-wire existed still gets the wiring floor on reuse.
        const finalSpec = autoWireSpecInputs(v.spec, contractQuantities).spec
        const order = orderSpec(finalSpec)
        const plan = materialisePlan(slug, finalSpec, order)
        // PART C coverage gate on the REUSE path too — the cached plan encodes the
        // sweep-derived selection; re-report the brief-named-unit coverage so a
        // re-run still surfaces (and loudly logs) any unsized unit.
        const coverage = checkUnitCoverage(coverageText(brief), '', order)
        if (coverage.named_units.length > 0) {
          const lines = coverage.coverage
            .map(c => `    ${c.covered_by ? '✓' : '✗ UNSIZED'} ${c.unit}${c.covered_by ? ` → ${c.covered_by}` : ''}`)
            .join('\n')
          console.error(`[bootstrap-tool-plan] COVERAGE GATE (brief-named units, reuse) for slug=${slug}:\n${lines}`)
          for (const u of coverage.uncovered) {
            console.error(`[bootstrap-tool-plan] COVERAGE GAP: checklist unit "${u}" unsized — no selected/created tool covers it for slug=${slug}.`)
          }
        }
        console.error(
          `[bootstrap-tool-plan] REUSING stored candidate slug=${slug} version=${prior.version} status=${prior.status} ` +
          `(no LLM call; ${finalSpec.steps.length} steps, ${new Set(order).size} tool_ids, coverage_gaps=${coverage.uncovered.length})`,
        )
        return {
          ok: true, plan, spec: finalSpec, provenance: BOOTSTRAP_PROVENANCE,
          candidate: { id: prior.id, slug, version: prior.version, status: prior.status, reused: true },
          attempts: 0, selected_tool_ids: order, llm_cost_usd: null,
          relevance: null, coverage,
        }
      }
      console.warn(`[bootstrap-tool-plan] stored candidate v${prior.version} for ${slug} fails current validation (${v.errors.length} errors) — re-harvesting`)
    } catch { /* corrupt row — re-harvest */ }
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, slug, attempts: 0, stage: 'no-api-key', validation_errors: [], error: 'OPENROUTER_API_KEY not set — cannot harvest' }
  }

  const fullCatalogue = buildToolCatalogue()
  if (fullCatalogue.length === 0) {
    return { ok: false, slug, attempts: 0, stage: 'empty-catalogue', validation_errors: [], error: 'tool catalogue empty — register-all must be imported before bootstrapToolPlan so listTools() is populated' }
  }

  const processText = targetProcessText(brief)
  // Relevance-sweep LLM cost (folded into the reported llm_cost_usd below).
  let totalCostSweep = 0

  // ── PART A: DETERMINISTIC RELEVANCE SWEEP (Tristan 2026-06-14) ─────────────
  // REPLACE the free-pick selection. Instead of letting the harvest pick tools
  // from the full 182-tool catalogue in one shot (which drifted 12↔22 run-to-run
  // and silently forgot brief-named units), run a deterministic YES/NO relevance
  // sweep over EVERY tool (batched, temp 0, cached by brief+catalogue hash). The
  // harvest's catalogue is then RESTRICTED to the swept-relevant subset — it only
  // WIRES the chosen tools, it no longer SELECTS them. Fail-safe: a disabled/
  // failed sweep falls back to the FULL catalogue (the prior behaviour) so the
  // chain still runs.
  let catalogue = fullCatalogue
  let relevanceMeta: ToolPlanBootstrapSuccess['relevance'] = null
  const sweep = await sweepToolRelevance({
    slug, brief, envelope,
    duties: contractQuantities.map(q2 => ({ key: q2.key, value: q2.value, unit: q2.unit })),
    catalogue: fullCatalogue,
    targetProcess: processText,
  })
  if (sweep.ok) {
    // UNION the swept-relevant set with the universal aggregators V3 requires (mass
    // producer + a cost tool), so a sweep that omits them can never break validation.
    const relevant = new Set(sweep.relevant_tool_ids)
    for (const e of fullCatalogue) {
      const id = e.tool_id
      if (id === UNIVERSAL_MASS_PRODUCER) relevant.add(id)
      else { const il = id.toLowerCase(); if (FORCE_KEEP_COST_TOKENS.some(t => il.includes(t))) relevant.add(id) }
    }
    catalogue = fullCatalogue.filter(e => relevant.has(e.tool_id))
    relevanceMeta = {
      swept: true,
      from_cache: sweep.from_cache,
      relevant_count: sweep.relevant_tool_ids.length,
      catalogue_count: fullCatalogue.length,
      relevant_tool_ids: [...relevant].sort(),
      cache_key: sweep.cache_key,
    }
    if (sweep.llm_cost_usd) totalCostSweep += sweep.llm_cost_usd
    console.error(
      `[bootstrap-tool-plan] RELEVANCE SWEEP narrowed catalogue ${fullCatalogue.length} → ${catalogue.length} tools ` +
      `(${sweep.relevant_tool_ids.length} judged relevant + universal aggregators; from_cache=${sweep.from_cache}) for slug=${slug}. ` +
      `The wiring harvest now only WIRES this deterministic subset.`,
    )
  } else {
    console.error(
      `[bootstrap-tool-plan] RELEVANCE SWEEP unavailable (stage=${sweep.stage}: ${sweep.error}) for slug=${slug} — ` +
      `FALLING BACK to the full ${fullCatalogue.length}-tool catalogue (the prior free-pick selection). The chain still runs.`,
    )
  }

  console.error(
    `[bootstrap-tool-plan] composing tool plan for novel slug=${slug} ` +
    `(catalogue=${catalogue.length}${catalogue.length !== fullCatalogue.length ? `/${fullCatalogue.length} swept` : ''} tools, ` +
    `brief_metric_keys=${briefMetricKeys.length}, contract_duties=${contractQuantities.length})`,
  )

  // (b)+(c) Harvest → validate, with TWO validation-repair attempts (errors fed
  // back). A TRANSIENT harvest failure (OpenRouter timeout / 5xx / transport drop)
  // does NOT consume one of those two attempts — it is retried IN PLACE with a
  // longer timeout, bounded by MAX_TRANSIENT_RETRIES. This was the RAS-regression
  // cascade: attempt 1 timed out (transient) and STOLE a validation turn, leaving
  // only one real validation attempt whose first-shot output had a V2c dimensional
  // mislabel → bootstrap failed → loud exit. Giving the model its full 2
  // error-feedback validation turns (and not letting a timeout burn one) is what
  // makes the harvest reliably reach a valid plan. FIX 2a applied at the source.
  // H5 (council) — multi-stage generate→validate→REPAIR. Each attempt feeds the
  // prior deterministic-validation errors back so the model fixes them. Two turns
  // is too few to converge a rich multi-tool plan: the RAS cold run reached the
  // RIGHT plan on the THIRD turn (turn 1 missed total_system_mass_kg; turn 2 hit a
  // V2c dimensional relabel on a generated tool's mass-named-but-rate field; turn 3
  // declares the field's true unit + wires the mass producer). 4 gives the repair
  // loop room to converge without burning many calls (most plans land by turn 2-3;
  // a transient retry does NOT consume a turn). A targeted "HOW TO FIX A DIMENSIONAL
  // MISMATCH" directive (buildHarvestPrompt) is injected when that error recurs, so
  // the model stops oscillating between the V2c relabel and the V3 coverage gaps.
  const MAX_VALIDATION_ATTEMPTS = 5
  const MAX_TRANSIENT_RETRIES = 4
  let attempts = 0
  let totalCost = 0
  let lastErrors: string[] = []
  let lastError = ''
  let transientRetries = 0
  let attempt = 0
  while (attempt < MAX_VALIDATION_ATTEMPTS) {
    attempt++
    attempts = attempt
    const prompt = buildHarvestPrompt(slug, brief, envelope, contractQuantities, catalogue, briefMetricKeys, lastErrors, processText)
    // Lengthen the timeout as transient retries accrue (a slow-but-alive model
    // gets more room), capped at 300s.
    const baseTimeout = opts.harvestTimeoutMs ?? DEFAULT_HARVEST_TIMEOUT_MS
    const thisTimeout = Math.min(300_000, baseTimeout + transientRetries * 60_000)
    const outcome = await harvestPlanViaLLM(prompt, thisTimeout)
    if (outcome.costUsd) totalCost += outcome.costUsd
    if (!outcome.parsed) {
      lastError = outcome.error ?? 'unknown harvest failure'
      // TRANSIENT (timeout/5xx/transport) → retry the SAME attempt index, do NOT
      // consume a validation turn, up to MAX_TRANSIENT_RETRIES total.
      if (isTransientHarvestError(lastError) && transientRetries < MAX_TRANSIENT_RETRIES) {
        transientRetries++
        attempt-- // refund this turn — the model never actually answered
        console.warn(`[bootstrap-tool-plan] attempt ${attempt + 1} TRANSIENT harvest failure (${lastError}) — retry ${transientRetries}/${MAX_TRANSIENT_RETRIES} in place (validation budget NOT consumed), next timeout ${Math.min(300_000, baseTimeout + transientRetries * 60_000) / 1000}s.`)
        continue
      }
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

    // (c.5) DETERMINISTIC AUTO-WIRE — rewrite constants→from_contract_key where a
    // high-confidence same-quantity source exists (FIX A floor; LLM-variance-
    // proof). Store the auto-wired spec so the cache reflects the final wiring.
    const wired = autoWireSpecInputs(v.spec, contractQuantities)
    const finalSpec = wired.spec
    if (wired.rewired.length > 0) {
      console.error(
        `[bootstrap-tool-plan] AUTO-WIRE: rewired ${wired.rewired.length} constant input(s) to contract keys — ` +
        wired.rewired.map(r => `${r.tool_id}.${r.param}←${r.from_contract_key}`).slice(0, 24).join(', '),
      )
    }

    // (d) ORDER + (e) MATERIALISE.
    const order = orderSpec(finalSpec)
    const plan = materialisePlan(slug, finalSpec, order)

    // ── PART C: COVERAGE GATE — every brief-NAMED unit must map to a selected
    // tool; LOG any uncovered unit LOUDLY (never silently drop). Diagnostic, not
    // fatal: the plan still runs, but the operator sees exactly which named unit
    // is unsized. The drum/microscreen filter (missing before) is one such unit.
    const coverage = checkUnitCoverage(coverageText(brief), '', order)
    if (coverage.named_units.length > 0) {
      const lines = coverage.coverage
        .map(c => `    ${c.covered_by ? '✓' : '✗ UNSIZED'} ${c.unit}${c.covered_by ? ` → ${c.covered_by}` : ''}`)
        .join('\n')
      console.error(`[bootstrap-tool-plan] COVERAGE GATE (brief-named units) for slug=${slug}:\n${lines}`)
      for (const u of coverage.uncovered) {
        console.error(`[bootstrap-tool-plan] COVERAGE GAP: checklist unit "${u}" unsized — no selected/created tool covers it for slug=${slug}.`)
      }
    }

    // (f) Candidate store — row stays 'candidate'; the run consumes in-memory.
    let candidate: { id: number; version: number; status: string }
    try {
      candidate = storeCandidate(slug, finalSpec, { selected_tool_ids: order, attempts })
    } catch (err) {
      return {
        ok: false, slug, attempts, stage: 'candidate-store', validation_errors: [],
        error: `plan validated but candidate-store insert failed: ${(err as Error).message}`,
      }
    }
    const reportedCost = totalCost + totalCostSweep
    console.error(
      `[bootstrap-tool-plan] BOOTSTRAPPED slug=${slug} steps=${finalSpec.steps.length} tool_ids=${new Set(order).size} ` +
      `candidate_id=${candidate.id} version=${candidate.version} status=${candidate.status} ` +
      `attempts=${attempts} cost_usd=${reportedCost.toFixed(4)} auto_wired=${wired.rewired.length} ` +
      `relevance_swept=${relevanceMeta ? `${relevanceMeta.relevant_count}/${relevanceMeta.catalogue_count}` : 'no'} ` +
      `coverage_gaps=${coverage.uncovered.length} (stored as CANDIDATE only — NO auto-promotion). ` +
      `Selected: ${order.join(', ')}`,
    )
    return {
      ok: true, plan, spec: finalSpec, provenance: BOOTSTRAP_PROVENANCE,
      candidate: { id: candidate.id, slug, version: candidate.version, status: candidate.status, reused: false },
      attempts, selected_tool_ids: order, llm_cost_usd: reportedCost > 0 ? reportedCost : null,
      relevance: relevanceMeta,
      coverage,
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
