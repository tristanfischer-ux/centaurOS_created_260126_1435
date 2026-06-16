/**
 * scripts/lib/orchestrator/generic/relevance-sweep.ts
 *
 * DETERMINISTIC RELEVANCE SWEEP — Tristan's design (2026-06-14) for UNIVERSAL,
 * DETERMINISTIC tool SELECTION on the selectPlan-MISS / unregistered-class path.
 *
 * THE WALL THIS KILLS: the on-the-fly tool-plan bootstrap (bootstrap-tool-plan.ts)
 * previously SELECTED tools with a single FREE-PICK LLM call ("pick the tools the
 * brief needs"). At temperature 0 that free-pick STILL drifted run-to-run — 12
 * tools one run, 22 the next — and it SILENTLY FORGOT tools the brief explicitly
 * named (the RAS rotary-drum microscreen filter was missing). A free-pick over 182
 * tools is an attention problem: the model never has to consider every tool, so it
 * forgets some and invents others.
 *
 * THE FIX (deterministic + exhaustive): instead of asking the model to PICK from
 * 182 tools in one shot, ask it a YES/NO RELEVANCE question for EVERY tool, in
 * BATCHES, against the DETAILED brief (product_description + target_process + the
 * U6 brief-expansion duties). Every tool gets a verdict — nothing is forgotten
 * (EXHAUSTIVE). The verdicts are CACHED keyed by a sha1 of the brief inputs +
 * catalogue snapshot (DETERMINISTIC) — a re-run replays the cache and reproduces
 * the IDENTICAL selection, so the 12-vs-22 drift is GONE. The swept-relevant subset
 * then REPLACES the free-pick catalogue handed to the wiring harvest (which now
 * only WIRES the chosen tools, it no longer SELECTS them).
 *
 * WHY a YES/NO sweep beats a class-whitelist applicable_to (the C1 investigation
 * finding): 145 of 182 tools use a CLOSED-WORLD class whitelist, and the RIGHT
 * tools for an unseen class are whitelisted to OTHER classes (RO→dialysis/VF,
 * agitation→bioreactor) — a whitelist can NEVER serve an unseen class by
 * construction. Relevance is judged by CAPABILITY (does this tool's physics fit
 * THIS plant's duties?), read fresh from the brief at runtime, with NO per-class
 * table.
 *
 * SCOPE: pure SELECTION. It does NOT map tool outputs to contract quantities — the
 * existing FAIL-CLOSED materialiser (bootstrap-tool-plan.ts) owns population, and
 * its #1-anti-pattern guard (never `?? fallback` a COMPUTED tool-output field) is
 * untouched. The sweep only narrows the candidate SET.
 *
 * FAIL-SAFE: any failure (no API key, transient LLM error after retries, a batch
 * that never returns a parseable verdict) returns `ok:false` → the caller keeps
 * the FULL catalogue (the prior free-pick behaviour) so the chain still runs. A
 * thin-but-correct narrowing never blocks the run.
 *
 * Env-gated UNIVERSAL_RELEVANCE_SWEEP (default ON; set =0 to disable → the caller
 * uses the full catalogue). Cache skipped via CHAIN_NO_RELEVANCE_CACHE=1.
 *
 * British spelling throughout.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

import type { BriefEnvelope, ParsedConstraints } from '../types'
import type { ToolCatalogueEntry } from './bootstrap-tool-plan'

// Same strong reasoner the bootstrap harvest + brief expander use — the sweep is a
// once-per-class (cached) judgement and must match hand quality (the minimal RIGHT
// relevant set). Cost (~$0.02-0.05 across the batches) is paid once per brief,
// never per run (cache replay is free).
const SWEEP_MODEL = 'google/gemini-3.1-pro-preview'
const MAX_OUTPUT_TOKENS = 150_000 // repo rule: 150_000 everywhere in pdf-engine-v2

/** Tools per batch. ~40 keeps each prompt small enough that the model genuinely
 *  considers EVERY tool in the batch (the whole point — no attention drop), while
 *  bounding the number of calls (182 / 40 ≈ 5 batches). */
const BATCH_SIZE = 40

/** Per-call abort timeout (ms). A slow-but-alive model on a later transient retry
 *  gets more room (caller-side ramp not needed — the sweep retries in place). */
const SWEEP_TIMEOUT_MS = 180_000
/** Transient (timeout / 5xx / transport) retries PER BATCH before that batch is
 *  declared failed (→ whole sweep fails → caller uses the full catalogue). */
const MAX_TRANSIENT_RETRIES = 3

const CACHE_DIR = resolve(homedir(), '.forge-truth', 'tool-relevance-cache')
export const RELEVANCE_SWEEP_SOURCE = `relevance-sweep@v1:${SWEEP_MODEL}`

// ── Result types ────────────────────────────────────────────────────────────

export interface ToolRelevanceVerdict {
  tool_id: string
  relevant: boolean
  /** One-line reason (the model's justification, trimmed). */
  reason: string
}

export interface RelevanceSweepSuccess {
  ok: true
  /** Tool ids judged RELEVANT (the selection that replaces the free-pick). */
  relevant_tool_ids: string[]
  /** Per-tool verdict (every catalogue tool, YES or NO). */
  verdicts: ToolRelevanceVerdict[]
  /** Cache hash (sha1 of brief inputs + catalogue snapshot). */
  cache_key: string
  /** True when the verdicts were replayed from cache (no LLM call). */
  from_cache: boolean
  llm_cost_usd: number | null
  /** Number of batch LLM calls made (0 on a cache hit). */
  batch_calls: number
}

export interface RelevanceSweepFailure {
  ok: false
  stage: 'disabled' | 'no-api-key' | 'empty-catalogue' | 'batch-failed'
  error: string
  /** How many batches succeeded before the failure (diagnostic). */
  batches_ok: number
  llm_cost_usd: number | null
}

export type RelevanceSweepResult = RelevanceSweepSuccess | RelevanceSweepFailure

// ── Cached on-disk shape ────────────────────────────────────────────────────

interface RelevanceCacheFile {
  source: string
  slug: string
  /** verdicts, sorted by tool_id for a stable file. */
  verdicts: ToolRelevanceVerdict[]
}

// ── Cache key ───────────────────────────────────────────────────────────────

/**
 * Deterministic cache key for a brief's relevance verdicts. Keyed ONLY on signal
 * that is STABLE across re-runs of the SAME brief:
 *   - the slug + the envelope identity (class/scale/application)
 *   - the detailed brief TEXT (product_description + target_process) — same brief
 *     file → byte-identical text → identical key
 *   - the catalogue SNAPSHOT (sorted tool_ids) — so a registry change (a new tool,
 *     a created tool) INVALIDATES the cache and forces a fresh sweep (H6 anti-
 *     overfit: never freeze the first realisation when the candidate set changed).
 *
 * DELIBERATELY EXCLUDES the duty VALUES (and even the duty key set). THIS IS THE
 * DETERMINISM FIX (2026-06-14): the engineering-contract quantities jitter run-to-
 * run (the brief-expansion + contract emission are not byte-stable — a duty's value
 * or even whether it lands varies), so keying on them gave a DIFFERENT cache key
 * each run → a fresh LLM sweep → a different relevant set (60 one run, 47 the next)
 * — the exact 12-vs-22 drift this whole mechanism exists to kill. The duties still
 * flow into the SWEEP PROMPT (so relevance is well-judged), but they MUST NOT key
 * the cache. Same slug-stable DB-first pattern the tool-creation PROPOSAL cache
 * already uses (keyed by slug, not duty-hash) to escape duty jitter. Same sha1 →
 * 16-hex idiom as brief-expander.ts.
 */
export function relevanceCacheKey(
  slug: string,
  productDescription: string,
  targetProcess: string,
  envelope: Pick<BriefEnvelope, 'class' | 'scale_tier' | 'application'>,
  catalogueToolIds: ReadonlyArray<string>,
  applicableToThisClass?: ReadonlyMap<string, boolean | null>,
): string {
  const catSig = [...catalogueToolIds].sort().join(',')
  // AUTHOR-SCOPE SIGNAL in the key (v2): the per-tool applicable_to verdict is a
  // PROMPT INPUT, so it must key the cache — otherwise a registry edit that flips
  // a tool's scope (e.g. adding aquaculture_ras to a tool's applicable_to list)
  // would replay a stale sweep that never saw the new signal (H6 anti-overfit:
  // never freeze the first realisation when an INPUT changed). Compact, sorted,
  // deterministic: `id:1` (incl) / `id:0` (excl) / omit when null (no-signal, so a
  // missing-signal run keys identically to a v1 run for the same brief+catalogue).
  const scopeSig = applicableToThisClass
    ? [...applicableToThisClass.entries()]
        .filter(([, v]) => v === true || v === false)
        .map(([id, v]) => `${id}:${v ? 1 : 0}`)
        .sort()
        .join(',')
    : ''
  const payload = [
    scopeSig ? `v2` : `v1`,
    `slug=${slug}`,
    `class=${envelope.class}/${envelope.scale_tier}/${envelope.application}`,
    `desc=${(productDescription ?? '').slice(0, 6000)}`,
    `process=${(targetProcess ?? '').slice(0, 4000)}`,
    `catalogue=${catSig}`,
    ...(scopeSig ? [`scope=${scopeSig}`] : []),
  ].join('\n')
  return createHash('sha1').update(payload).digest('hex').slice(0, 16)
}

function readCache(cacheKey: string): ToolRelevanceVerdict[] | null {
  if (process.env.CHAIN_NO_RELEVANCE_CACHE === '1') return null
  const path = resolve(CACHE_DIR, `${cacheKey}.json`)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as RelevanceCacheFile
    if (!parsed || !Array.isArray(parsed.verdicts)) return null
    const out: ToolRelevanceVerdict[] = []
    for (const v of parsed.verdicts) {
      if (v && typeof v.tool_id === 'string' && typeof v.relevant === 'boolean') {
        out.push({ tool_id: v.tool_id, relevant: v.relevant, reason: typeof v.reason === 'string' ? v.reason : '' })
      }
    }
    return out.length > 0 ? out : null
  } catch {
    return null // corrupt cache → re-sweep
  }
}

function writeCache(cacheKey: string, slug: string, verdicts: ToolRelevanceVerdict[]): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    const file: RelevanceCacheFile = {
      source: RELEVANCE_SWEEP_SOURCE,
      slug,
      verdicts: [...verdicts].sort((a, b) => a.tool_id.localeCompare(b.tool_id)),
    }
    writeFileSync(resolve(CACHE_DIR, `${cacheKey}.json`), JSON.stringify(file, null, 2))
  } catch {
    /* non-fatal — a cache write failure just means the next run re-sweeps */
  }
}

// ── Prompt (one batch) ──────────────────────────────────────────────────────

/** One catalogue line for the sweep: tool_id + domain + purpose + key OUTPUT
 *  fields (what the tool COMPUTES — the relevance signal) + the AUTHOR-SCOPE
 *  SIGNAL (the tool's own applicable_to verdict for THIS class — a SIGNAL the
 *  model weighs, never a veto). Inputs are omitted to keep the batch compact;
 *  the wiring harvest (downstream) shows full I/O. */
function toolLine(entry: ToolCatalogueEntry, applicableToThisClass?: ReadonlyMap<string, boolean | null>): string {
  const outs = entry.output_fields.slice(0, 8).join(', ')
  const more = entry.output_fields.length > 8 ? ', …' : ''
  // AUTHOR-SCOPE SIGNAL: surface the tool author's own applicable_to verdict so a
  // keyword-only YES against a tool scoped to a DIFFERENT product domain must be
  // justified on real physics. Omitted when there is no signal (null/absent).
  const scope = applicableToThisClass?.get(entry.tool_id)
  const scopeTag =
    scope === true
      ? `\n    author-scope: INCLUDES this class (the tool author scoped it to cover this product — corroborating)`
      : scope === false
        ? `\n    author-scope: EXCLUDES this class (the tool author wrote it for OTHER products — a YES needs genuine physics, not a shared keyword)`
        : ''
  return `- ${entry.tool_id} [${entry.domain}] — ${entry.description}\n    computes: ${outs || '(none)'}${more}${scopeTag}`
}

function buildSweepPrompt(
  slug: string,
  brief: ParsedConstraints,
  targetProcess: string,
  envelope: BriefEnvelope,
  dutyLines: string,
  batch: ToolCatalogueEntry[],
  batchIndex: number,
  batchCount: number,
  applicableToThisClass?: ReadonlyMap<string, boolean | null>,
): string {
  const desc = String(brief.product_description ?? '').slice(0, 5000)
  const lines = batch.map(e => toolLine(e, applicableToThisClass)).join('\n')
  return (
    `You are a CHARTERED PRINCIPAL ENGINEER deciding which engineering TOOLS are ` +
    `RELEVANT to designing ONE specific plant. You will be shown the detailed brief ` +
    `and a BATCH of candidate tools (batch ${batchIndex + 1} of ${batchCount}). For ` +
    `EVERY tool in the batch you must answer: is this tool RELEVANT to designing THIS ` +
    `plant — i.e. would a competent design team genuinely USE it to size/compute a ` +
    `duty or a piece of principal equipment this plant requires? Answer YES or NO with ` +
    `a one-line reason. Judge by the tool's PHYSICS/CAPABILITY (what it computes) vs ` +
    `what THIS brief needs — NOT by any class label.\n\n` +
    `BE INCLUSIVE FOR A GENUINE DUTY, STRICT FOR A FOREIGN DOMAIN. Say YES to a tool ` +
    `whose computation maps to a real duty or principal equipment item of this plant ` +
    `(every pump, vessel/tank, filter/separator, reactor/biological stage, gas-transfer/` +
    `degasser/aeration stage, disinfection stage, heat-exchange/heat-pump/thermal duty, ` +
    `the electrical distribution chain — cable/ampacity, transformer, load schedule — and ` +
    `the control/instrumentation), AND to the universal whole-system aggregators (mass, ` +
    `cost/economics, lifecycle, reliability, transport, regulatory). Say NO to a tool from ` +
    `a clearly DIFFERENT product domain that this plant does not contain (e.g. for a fish ` +
    `farm: aircraft/airfoil aerodynamics, submarine/AUV hydrostatics, spacecraft/orbit, ` +
    `bicycle/vehicle dynamics, battery-cell electrochemistry, photovoltaic/LED photonics ` +
    `— UNLESS the brief genuinely describes that subsystem).\n\n` +
    // ── DOMAIN-DISCRIMINATION (the C1 leak fix) ───────────────────────────────
    // The failure this guards: a tool gets a YES on a SHARED KEYWORD while its
    // physics DOMAIN differs from the plant's process. A heating water-source
    // heat-pump shares the word "thermal" with a chiller-COP tool, but a chiller
    // tool computes the WRONG thing (cooling/condenser duty) for a heating duty.
    `CRITICAL — JUDGE THE PHYSICS DOMAIN, NOT A SHARED KEYWORD. A tool that shares ` +
    `a word with one of this plant's duties is NOT automatically relevant; its ` +
    `actual COMPUTATION must answer a question THIS plant asks. Reject these concrete ` +
    `keyword-only mismatches (they are exactly how the wrong tool leaks in):\n` +
    `  • A REFRIGERATION / CHILLER tool that computes a coefficient-of-performance for ` +
    `COOLING, a "total cooling load", "chiller capacity", "condenser duty", or an ` +
    `evaporator/condenser cycle is NOT a HEATING tool. If this plant's thermal duty is ` +
    `to ADD heat / HOLD a warm setpoint / raise make-up-water temperature (a heating ` +
    `heat-pump, a process heater, a boiler), a cooling-cycle COP/chiller tool is the ` +
    `WRONG domain — say NO (use the heating / heat-loss / heat-recovery / heat-balance ` +
    `tool instead). Only say YES to a refrigeration/chiller tool when the plant genuinely ` +
    `REJECTS heat (a cold store, a process chiller, a data-centre/battery cooling loop).\n` +
    `  • A COMFORT-HVAC building-load tool (sensible+latent room load, supply airflow, ` +
    `occupant ventilation) is NOT a PROCESS-HEAT or process-water tool. A plant whose ` +
    `thermal duty is on its PROCESS FLUID (heating/cooling a recirculating water or ` +
    `chemical inventory) is not sized by a room-comfort HVAC load — say NO unless the ` +
    `brief explicitly needs habitable-space air-conditioning.\n` +
    `  • A HYDROPONIC NUTRIENT-SOLUTION tool (calcium nitrate / monopotassium phosphate / ` +
    `Ca and P dosing, target EC/conductivity of a plant-feed solution, N-P-K make-up) is ` +
    `a CROP-FEED chemistry tool for SOILLESS PLANT GROWING. It is NOT a fish-farm, ` +
    `aquaculture, potable-water, or general process-water tool. A fish-rearing or ` +
    `water-treatment plant dosing for ALKALINITY / pH / salinity / disinfection is NOT ` +
    `fed by a hydroponic nutrient formula — say NO (the salt/alkalinity inventory of ` +
    `seawater or process water is a DIFFERENT calculation).\n` +
    `  • A MARINE / submarine tool (seawater hull hydrostatics, cathodic / sacrificial-` +
    `anode protection, DNV-RP-B401, dive depth) belongs to a vessel that operates IN the ` +
    `sea. A LAND-BASED plant — even one that handles seawater or is called "marine" — has ` +
    `no submerged pressure hull and no ship-hull anode scheme; say NO to hull/anode/dive ` +
    `tools unless the product is itself an underwater vehicle.\n` +
    `The rule is symmetric and UNIVERSAL across any class: a cooling tool is not a heating ` +
    `tool; a crop-feed tool is not a process-water tool; a comfort tool is not a process ` +
    `tool; a vehicle tool is not a fixed-plant tool. Weigh the AUTHOR-SCOPE SIGNAL printed ` +
    `on each tool (the author's own applicable_to verdict for this class): an EXCLUDES ` +
    `signal means a YES must rest on genuine shared PHYSICS, not a shared word — if the ` +
    `only thing connecting the tool to this plant is a keyword, the EXCLUDES signal ` +
    `confirms it is the wrong domain. (The signal is advice, NOT a hard rule: an unseen ` +
    `archetype can still legitimately need a tool the author scoped narrowly — say YES ` +
    `when the COMPUTATION genuinely fits, EXCLUDES notwithstanding.)\n\n` +
    `PRODUCT CLASS SLUG: "${slug}"\n` +
    `ENVELOPE: class=${envelope.class}, scale_tier=${envelope.scale_tier}, application=${envelope.application}\n\n` +
    `BRIEF (what the plant is + what it produces):\n${desc}\n\n` +
    (targetProcess
      ? `STATED PROCESS (the named unit operations the plant MUST contain — every unit named here needs a sizing tool):\n${targetProcess.slice(0, 4000)}\n\n`
      : '') +
    (dutyLines
      ? `ENGINEERING DUTIES THE SYSTEM MUST PERFORM (the quantified requirements — a tool is relevant if it sizes equipment that MEETS one of these):\n${dutyLines}\n\n`
      : '') +
    `CANDIDATE TOOLS (batch ${batchIndex + 1}/${batchCount} — give a verdict for EVERY ONE; do not skip any):\n${lines}\n\n` +
    `Return STRICT JSON ONLY (no markdown fence, no commentary) — an array with one ` +
    `entry per tool in the batch, IN THE SAME ORDER, using the EXACT tool_id strings:\n` +
    `{"verdicts": [{"tool_id": "<exact id>", "relevant": true|false, "reason": "<one line>"}]}`
  )
}

// ── LLM batch call ──────────────────────────────────────────────────────────

interface BatchOutcome {
  verdicts: ToolRelevanceVerdict[] | null
  costUsd: number | null
  error: string | null
}

function isTransientError(error: string): boolean {
  const e = (error || '').toLowerCase()
  return (
    e.includes('timeout') || e.includes('aborted') ||
    e.includes('http 5') ||
    e.includes('econnreset') || e.includes('socket hang up') ||
    e.includes('network') || e.includes('fetch failed') || e.includes('etimedout') ||
    e.includes('empty completion')
  )
}

/** Parse the model's batch reply into per-tool verdicts, keyed by tool_id. Tolerant
 *  of order drift: matches by tool_id (not array position). A tool the model omitted
 *  from the reply is left UNDECIDED here (the caller defaults an omitted tool to
 *  NOT-relevant, but ONLY after the whole batch succeeded — never silently). */
function parseBatchReply(raw: unknown, batchIds: Set<string>): Map<string, ToolRelevanceVerdict> {
  const out = new Map<string, ToolRelevanceVerdict>()
  const g = raw as Record<string, any>
  const arr: any[] = Array.isArray(g?.verdicts) ? g.verdicts : (Array.isArray(g) ? g : [])
  for (const v of arr) {
    const id = typeof v?.tool_id === 'string' ? v.tool_id.trim() : ''
    if (!id || !batchIds.has(id) || out.has(id)) continue
    const relevant = v?.relevant === true || v?.relevant === 'true' || v?.relevant === 'yes' || v?.relevant === 'YES'
    out.set(id, {
      tool_id: id,
      relevant,
      reason: typeof v?.reason === 'string' ? v.reason.slice(0, 200) : '',
    })
  }
  return out
}

/**
 * Robustly extract a JSON value from an LLM completion that may be an OBJECT
 * (`{"verdicts":[…]}`) or a bare ARRAY (`[{…}]`). Returns:
 *   undefined — no JSON bracket found at all,
 *   null      — a bracket was found but every parse attempt failed,
 *   value     — the parsed JSON.
 * Strategy: pick whichever of `{` / `[` opens FIRST, slice to the matching last
 * close of that kind, and parse. If that fails, try the other bracket kind as a
 * fallback (handles a stray prefix char). Never throws.
 */
function extractJson(text: string): unknown | null | undefined {
  const firstObj = text.indexOf('{')
  const firstArr = text.indexOf('[')
  if (firstObj === -1 && firstArr === -1) return undefined
  const tryParse = (open: number, closeChar: string): unknown | undefined => {
    if (open === -1) return undefined
    const close = text.lastIndexOf(closeChar)
    if (close === -1 || close < open) return undefined
    try { return JSON.parse(text.slice(open, close + 1)) } catch { return undefined }
  }
  // Prefer the bracket that opens first (the natural document root).
  const objFirst = firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)
  const primary = objFirst ? tryParse(firstObj, '}') : tryParse(firstArr, ']')
  if (primary !== undefined) return primary
  const fallback = objFirst ? tryParse(firstArr, ']') : tryParse(firstObj, '}')
  if (fallback !== undefined) return fallback
  return null
}

async function sweepBatchViaLLM(prompt: string, batchIds: Set<string>): Promise<BatchOutcome> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { verdicts: null, costUsd: null, error: 'OPENROUTER_API_KEY not set' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS tool-relevance sweep',
      },
      body: JSON.stringify({
        model: SWEEP_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(SWEEP_TIMEOUT_MS),
    })
    if (!res.ok) return { verdicts: null, costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { verdicts: null, costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})` }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    // The model may return either an OBJECT (`{"verdicts":[…]}`) or a bare ARRAY
    // (`[{…},{…}]`). Slice from the FIRST opening bracket of either kind to its
    // matching last closing bracket — a naive `{`…`}` slice on an array reply
    // grabs `{…},{…}` (invalid). Choose the bracket type by whichever opens first.
    const parsed = extractJson(cleaned)
    if (parsed === undefined) return { verdicts: null, costUsd, error: 'no JSON object/array in completion' }
    if (parsed === null) return { verdicts: null, costUsd, error: 'JSON parse failed (object/array + array fallbacks both failed)' }
    const map = parseBatchReply(parsed, batchIds)
    return { verdicts: [...map.values()], costUsd, error: null }
  } catch (err) {
    return { verdicts: null, costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}` }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface RelevanceSweepInput {
  slug: string
  brief: ParsedConstraints
  envelope: BriefEnvelope
  /** The detailed-brief duties (key/value/unit) — the contract quantities + U6
   *  derived requirements the orchestrator already assembled. */
  duties: ReadonlyArray<{ key: string; value: number; unit: string }>
  /** The full registered-tool catalogue (buildToolCatalogue()). */
  catalogue: ReadonlyArray<ToolCatalogueEntry>
  /** The brief's stated process text (constraints.target_process). Used in the
   *  prompt + the cache key so the sweep keys off the named unit operations. */
  targetProcess?: string
  /**
   * Per-tool AUTHOR-SCOPE SIGNAL (NOT a veto). For each tool_id, the result of
   * the tool's OWN `applicable_to(envelope, contract)` predicate evaluated for
   * THIS plant's class:
   *   true  — the tool author scoped this tool to INCLUDE this class.
   *   false — the tool author scoped it to EXCLUDE this class (it was written
   *           for OTHER products).
   *   null / absent — the predicate could not be evaluated (no signal).
   *
   * This is the C1 `applicable_to` decision surfaced as a SIGNAL the model
   * WEIGHS — it is deliberately NOT used to filter the catalogue (a too-narrow
   * author scope must never starve an unseen archetype of a physically-fitting
   * tool — that is exactly the whitelist the capability sweep replaced). It only
   * sharpens the YES/NO judgement so a KEYWORD-ONLY match against a tool whose
   * author scoped it to a DIFFERENT product domain is rejected (the RAS chiller-
   * COP / comfort-HVAC / hydroponic-nutrient leak). When the author INCLUDED the
   * class the model is told so (a corroborating signal); when EXCLUDED, the model
   * must justify a YES on genuine physics, not a shared keyword.
   */
  applicableToThisClass?: ReadonlyMap<string, boolean | null>
}

/**
 * Run the deterministic relevance sweep over the FULL catalogue. Returns the
 * RELEVANT subset (every YES verdict) + the per-tool verdicts. Cached by a sha1 of
 * the brief inputs + catalogue snapshot — a re-run replays the cache and reproduces
 * the IDENTICAL selection (determinism). Fail-safe: returns ok:false on any failure
 * so the caller keeps the full catalogue.
 *
 * Semantics of an omitted verdict: if a batch SUCCEEDS but the model did not return
 * a verdict for some tool in that batch, that tool defaults to NOT-relevant (the
 * model considered the batch and chose to leave it out). A batch that FAILS (no
 * parseable verdicts at all, after retries) fails the WHOLE sweep — we never ship a
 * partial sweep that silently drops a third of the catalogue.
 */
export async function sweepToolRelevance(input: RelevanceSweepInput): Promise<RelevanceSweepResult> {
  if (process.env.UNIVERSAL_RELEVANCE_SWEEP === '0') {
    return { ok: false, stage: 'disabled', error: 'UNIVERSAL_RELEVANCE_SWEEP=0', batches_ok: 0, llm_cost_usd: null }
  }
  const { slug, brief, envelope, duties, catalogue } = input
  const targetProcess = String(input.targetProcess ?? '')
  if (catalogue.length === 0) {
    return { ok: false, stage: 'empty-catalogue', error: 'tool catalogue empty', batches_ok: 0, llm_cost_usd: null }
  }

  const catalogueToolIds = catalogue.map(c => c.tool_id)
  const applicableToThisClass = input.applicableToThisClass
  const cacheKey = relevanceCacheKey(
    slug,
    String(brief.product_description ?? ''),
    targetProcess,
    envelope,
    catalogueToolIds,
    applicableToThisClass,
  )

  // (0) CACHE REPLAY — deterministic, free. Only verdicts whose tool_id is STILL in
  // the catalogue are honoured (defensive; the catalogue snapshot is in the key, so
  // a drift already invalidates, but never trust a stale id).
  const cached = readCache(cacheKey)
  if (cached) {
    const catSet = new Set(catalogueToolIds)
    const verdicts = cached.filter(v => catSet.has(v.tool_id))
    // The cache is valid only if it covers EVERY catalogue tool (a complete sweep).
    // A partial cache (catalogue grew since) is ignored → fresh sweep.
    if (verdicts.length === catalogueToolIds.length) {
      const relevant = verdicts.filter(v => v.relevant).map(v => v.tool_id).sort()
      console.error(
        `[relevance-sweep] CACHE HIT slug=${slug} key=${cacheKey}: ${relevant.length}/${catalogueToolIds.length} tools relevant ` +
        `(replayed, no LLM call) — deterministic selection.`,
      )
      return { ok: true, relevant_tool_ids: relevant, verdicts, cache_key: cacheKey, from_cache: true, llm_cost_usd: null, batch_calls: 0 }
    }
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return { ok: false, stage: 'no-api-key', error: 'OPENROUTER_API_KEY not set — cannot sweep', batches_ok: 0, llm_cost_usd: null }
  }

  // Duty lines for the prompt (shared across batches).
  const dutyLines = duties
    .slice(0, 120)
    .map(d => `- ${d.key} = ${d.value} ${d.unit}`)
    .join('\n')

  // (a) BATCH the catalogue. Sorted by tool_id so batches are STABLE run-to-run
  // (the catalogue is already sorted by buildToolCatalogue, but re-assert it here so
  // the cache key's catalogue order never matters to batching).
  const sorted = [...catalogue].sort((a, b) => a.tool_id.localeCompare(b.tool_id))
  const batches: ToolCatalogueEntry[][] = []
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) batches.push(sorted.slice(i, i + BATCH_SIZE))

  console.error(
    `[relevance-sweep] SWEEPING slug=${slug} key=${cacheKey}: ${catalogue.length} tools in ${batches.length} batch(es) of ≤${BATCH_SIZE} ` +
    `(model ${SWEEP_MODEL}, temp 0) — every tool gets a YES/NO verdict.`,
  )

  const verdictById = new Map<string, ToolRelevanceVerdict>()
  let totalCost = 0
  let batchCalls = 0
  let batchesOk = 0

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const batchIds = new Set(batch.map(b => b.tool_id))
    const prompt = buildSweepPrompt(slug, brief, targetProcess, envelope, dutyLines, batch, bi, batches.length, applicableToThisClass)

    let outcome = await sweepBatchViaLLM(prompt, batchIds)
    batchCalls++
    if (outcome.costUsd) totalCost += outcome.costUsd
    // Transient retry IN PLACE (does not advance the batch index).
    for (let r = 1; r <= MAX_TRANSIENT_RETRIES && outcome.error != null && isTransientError(outcome.error); r++) {
      console.error(`[relevance-sweep] batch ${bi + 1}/${batches.length} TRANSIENT failure (${outcome.error}) — retry ${r}/${MAX_TRANSIENT_RETRIES}.`)
      outcome = await sweepBatchViaLLM(prompt, batchIds)
      batchCalls++
      if (outcome.costUsd) totalCost += outcome.costUsd
    }

    if (outcome.error != null || !outcome.verdicts || outcome.verdicts.length === 0) {
      // A batch that produced NO verdicts at all fails the WHOLE sweep (never ship a
      // partial sweep that silently drops this batch's tools) → caller uses full set.
      return {
        ok: false,
        stage: 'batch-failed',
        error: `batch ${bi + 1}/${batches.length} produced no verdicts: ${outcome.error ?? 'empty verdict list'}`,
        batches_ok: batchesOk,
        llm_cost_usd: totalCost > 0 ? totalCost : null,
      }
    }
    for (const v of outcome.verdicts) verdictById.set(v.tool_id, v)
    batchesOk++
  }

  // (b) ASSEMBLE the full verdict set. Every catalogue tool gets a verdict: the
  // model's YES/NO when present, else NOT-relevant (the batch succeeded and the
  // model left it out — an implicit NO, recorded explicitly for the cache).
  const verdicts: ToolRelevanceVerdict[] = sorted.map(entry =>
    verdictById.get(entry.tool_id) ?? { tool_id: entry.tool_id, relevant: false, reason: '(omitted by sweep → not relevant)' },
  )
  const relevant = verdicts.filter(v => v.relevant).map(v => v.tool_id).sort()

  // (f) CACHE the complete verdict set keyed by the brief+catalogue hash.
  writeCache(cacheKey, slug, verdicts)

  console.error(
    `[relevance-sweep] DONE slug=${slug} key=${cacheKey}: ${relevant.length}/${catalogue.length} tools RELEVANT ` +
    `(${batchCalls} batch call(s), cost_usd=${totalCost.toFixed(4)}). Cached → re-runs replay this exact selection. ` +
    `Relevant: ${relevant.join(', ')}`,
  )

  return {
    ok: true,
    relevant_tool_ids: relevant,
    verdicts,
    cache_key: cacheKey,
    from_cache: false,
    llm_cost_usd: totalCost > 0 ? totalCost : null,
    batch_calls: batchCalls,
  }
}

// ── Coverage gate (Part C) — brief-NAMED unit checklist ─────────────────────
//
// UNIVERSAL: parse the brief's stated process text for the named UNIT OPERATIONS
// the plant must contain, then confirm each maps to a SELECTED-or-CREATED tool.
// Any uncovered named unit is LOGGED LOUDLY ("checklist unit X unsized") — never
// silently dropped. No per-class table: the unit vocabulary is a generic list of
// process-unit-operation synonyms found across industrial plants; a unit only
// "fires" if the brief's own process text mentions it.

/** Canonical named process units + the synonym tokens that identify each in the
 *  brief's process text. Generic across industrial plants (NOT per-class). The
 *  `match` tokens detect the unit in the BRIEF; the `toolHints` tokens detect a
 *  covering tool in the selected/created set (matched against tool_id). */
interface NamedUnit {
  unit: string
  match: RegExp
  toolHints: RegExp
}

// NOTE on the `match` regexes: each uses a LEADING \b (match a word-START) but NO
// trailing \b, because the tokens are STEMS meant to match inside longer words
// (degass→degassERS, oxygenat→oxygenatION, nitrif→nitrifICATION, recirculat→
// recirculatING). A trailing \b would WRONGLY reject those (\b(degass)\b fails on
// "degassers" — there is no boundary between "degass" and "ers"). Multi-word and
// exact tokens keep their own boundaries where needed.
const NAMED_UNITS: NamedUnit[] = [
  // Solids removal — the RAS drum filter that was MISSING before is the headline case.
  { unit: 'drum/microscreen filter', match: /\b(drum\s*filter|microscreen|micro-screen|micro\s*screen|rotary\s*drum|drum\s*screen|sieve\s*bend)/i, toolHints: /(drum|microscreen|micro-screen|screen|sieve|solids|filtration|clarif)/i },
  { unit: 'biofilter (MBBR/biological)', match: /\b(mbbr|moving[-\s]?bed|biofilter|bio-?filter|biofilm|nitrif|trickling\s*filter|fixed[-\s]?film)/i, toolHints: /(mbbr|biofilter|bio-?filter|biofilm|nitrif|biolog|monod|bioreactor|trickl)/i },
  { unit: 'CO2 degasser / stripping column', match: /\b(degas|co2\s*strip|carbon\s*dioxide\s*strip|stripping\s*column|packed[-\s]?column|degasifier)/i, toolHints: /(degas|de-?gas|strip|column|packed|co2|carbon-dioxide|mass-transfer|aerat|absorption|htu)/i },
  { unit: 'oxygenation (cones / pure O2)', match: /\b(oxygen\s*cone|down-?flow\s*bubble|oxygenat|re-?oxygenat|pure\s*oxygen|dissolved\s*oxygen|psa\s*oxygen|liquid\s*oxygen)/i, toolHints: /(oxygen|dissolved|gas-transfer|kla|psa|cone|aerat)/i },
  { unit: 'UV disinfection', match: /\b(ultraviolet|uv\s*reactor|uv\s*disinfect|uv\s*steril|uv\s*dose|ozone)/i, toolHints: /(uv|ultraviolet|disinfect|steril|ozone|photolys|dose)/i },
  { unit: 'heat pump / thermal hold', match: /\b(heat\s*pump|heat\s*recovery|heating\s*duty|thermal\s*duty|hold.*temperature|temperature.*hold|chiller|hvac|boiler)/i, toolHints: /(heat-pump|heatpump|heat-loss|heatloss|heat-recovery|thermal|hvac|chiller|refriger|building-envelope|cop|boiler|scop)/i },
  // Pumping / hydraulics — almost every plant; matched broadly.
  { unit: 'recirculation / process pumps', match: /\b(recirculat|recirc\b|pump|circulation\s*loop|hydraulic\s*retention|turnover\s*rate|flow\s*loop)/i, toolHints: /(pump|hydraul|flow|pipe|fluids|head)/i },
  // Electrical distribution — drives the load schedule + transformer + cabling.
  { unit: 'electrical distribution', match: /\b(electrical|micro-?grid|mva\b|megavolt|switchgear|transformer|generator|backup\s*power|load\s*schedule|feeder)/i, toolHints: /(electric|grid|cable|ampac|transformer|switchgear|power-distribution|power-module|load|feeder|generator|opendss|pandapower)/i },
  // Control / instrumentation — the fail-safe control + alarms.
  { unit: 'control & instrumentation', match: /\b(control\s*system|fail-?safe|alarm|instrumentation|scada|plc|sensor|auto-?dialler|setpoint\s*control|monitoring)/i, toolHints: /(control|instrument|scada|plc|sensor|pid|monitor|alarm|reliability)/i },
]

export interface CoverageGateResult {
  /** Named units the brief's process text mentions. */
  named_units: string[]
  /** unit → covering tool_id (the first selected/created tool whose id matches the
   *  unit's toolHints), or null when UNCOVERED. */
  coverage: Array<{ unit: string; covered_by: string | null }>
  /** The uncovered named units (the loud-log set). */
  uncovered: string[]
}

/**
 * Pure coverage check: from the brief's process text, enumerate the named units and
 * map each to a selected/created tool. Logs nothing (the caller logs) — returns the
 * mapping + the uncovered set so the caller can LOG LOUDLY and the test can assert
 * (drum-filter MUST be covered). `selectedToolIds` is the FINAL plan's tool ids
 * (relevant existing + created). `processText` is the brief's stated process (+ the
 * product_description as a fallback — many briefs name the units in the description).
 */
export function checkUnitCoverage(
  processText: string,
  productDescription: string,
  selectedToolIds: ReadonlyArray<string>,
): CoverageGateResult {
  const haystack = `${processText}\n${productDescription}`
  const ids = [...selectedToolIds]
  const named: NamedUnit[] = NAMED_UNITS.filter(u => u.match.test(haystack))
  const coverage = named.map(u => {
    const hit = ids.find(id => u.toolHints.test(id)) ?? null
    return { unit: u.unit, covered_by: hit }
  })
  return {
    named_units: named.map(u => u.unit),
    coverage,
    uncovered: coverage.filter(c => c.covered_by == null).map(c => c.unit),
  }
}
